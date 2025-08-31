/*
pv.js — Masonry grid + Lightbox + Preloader
- Creates a known-good lightbox (removes any existing #lightbox)
- Preloads grid <img> and data-video/data-video-high metadata, shows progress
- Shows "Skip" button after 5s to dismiss preloader
- Robust layout: uses getBoundingClientRect, relayout ticks, images load detection
- Delegated click handlers, Esc/arrow navigation, overlay+close button to dismiss

Usage:
- Keep your grid markup similar to:
  <div class="grid"> 
    <div class="grid-item" data-video-high="..." data-thumb-low="..."> ... </div>
    <div class="grid-item"><div class="card"><img src="thumb-low.jpg" data-high="image-high.jpg" /></div></div>
  </div>

- Optionally include the PV CSS from earlier conversation (preloader + lightbox tweaks).
*/

(function () {
  // ---------- Config ----------
  const gutter = 12;           // px
  const minColumnWidth = 220;  // px
  const maxColumns = 5;
  const rowHeight = 8;         // px

  // ---------- Utility ----------
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  // ---------- Elements & state ----------
  const grid = document.querySelector('.grid');
  if (!grid) {
    console.warn('pv.js: no .grid found — aborting initialization.');
    return;
  }

  let lightbox = null;
  let lightboxContent = null;
  let keydownAttached = false;
  let mediaItems = [];

  // Preloader state
  let preloader = null;
  let progressEl = null;
  let skipBtn = null;
  let skipShown = false;

  // ---------- Robust lightbox creation (always create a fresh one) ----------
  function removeExistingLightbox() {
    const existing = document.getElementById('lightbox');
    if (existing) {
      try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) {}
    }
  }

  function createLightbox() {
    removeExistingLightbox();

    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    // minimal inline styles for safety
    Object.assign(lightbox.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      display: 'none',
      zIndex: '2147483646',
      background: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      boxSizing: 'border-box',
      overflow: 'auto'
    });

    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    Object.assign(lightboxContent.style, {
      boxSizing: 'border-box',
      minWidth: '160px',
      minHeight: '120px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      background: 'transparent'
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '12px',
      right: '16px',
      fontSize: '30px',
      color: '#fff',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      zIndex: '10'
    });

    lightbox.appendChild(closeBtn);
    lightbox.appendChild(lightboxContent);
    document.body.appendChild(lightbox);

    closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); hideLightbox(); });
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) hideLightbox(); });

    if (!keydownAttached) {
      document.addEventListener('keydown', onKeyDown);
      keydownAttached = true;
    }
  }

  function clearLightboxContent() {
    if (!lightboxContent) return;
    const video = lightboxContent.querySelector('video');
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        while (video.firstChild) video.removeChild(video.firstChild);
      } catch (e) {}
    }
    lightboxContent.innerHTML = '';
    lightboxContent.style.width = '';
    lightboxContent.style.height = '';
    lightboxContent.style.minWidth = '160px';
    lightboxContent.style.minHeight = '120px';
  }

  // ---------- Resolve media from a .grid-item ----------
  function resolveMediaForItem(item) {
    const data = item.dataset || {};
    const imgEl = item.querySelector('img');
    const isVideo = !!(data.video || data.videoHigh);
    if (isVideo) {
      const srcHigh = data.videoHigh || data.video || '';
      const poster = data.thumbHigh || data.thumbLow || (imgEl && imgEl.dataset && imgEl.dataset.high) || (imgEl && imgEl.src) || '';
      return { type: 'video', src: srcHigh, poster };
    } else {
      const hi = data.thumbHigh || data.high || (imgEl && imgEl.dataset && imgEl.dataset.high) || (imgEl && imgEl.src) || '';
      const low = data.thumbLow || (imgEl && imgEl.src) || '';
      return { type: 'image', srcHigh: hi, srcLow: low };
    }
  }

  // ---------- Lightbox show/hide/navigation ----------
  function computeLightboxSize() {
    const maxW = Math.min(window.innerWidth * 0.9, 1400);
    const maxH = Math.min(window.innerHeight * 0.8, 1000);
    return { w: Math.round(maxW), h: Math.round(maxH) };
  }

  let currentIndex = 0;
  function showLightboxByIndex(index) {
    if (!lightbox || !lightboxContent) createLightbox();
    collectMediaItems();
    if (mediaItems.length === 0) return console.warn('pv.js: no media items found in grid.');
    if (index < 0 || index >= mediaItems.length) return console.warn('pv.js: index out of range', index);
    currentIndex = index;
    clearLightboxContent();

    const item = mediaItems[index];
    const media = resolveMediaForItem(item);

    lightbox.style.display = 'flex';
    const size = computeLightboxSize();
    lightboxContent.style.width = size.w + 'px';
    lightboxContent.style.height = size.h + 'px';
    lightboxContent.style.minWidth = '120px';
    lightboxContent.style.minHeight = '90px';

    if (!media || !media.type) {
      const p = document.createElement('div');
      p.style.color = '#fff';
      p.style.padding = '12px';
      p.textContent = 'No preview available';
      lightboxContent.appendChild(p);
      return;
    }

    if (media.type === 'video') {
      if (!media.src) {
        if (media.poster) {
          const img = document.createElement('img');
          img.src = media.poster;
          img.alt = item.getAttribute('aria-label') || '';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.onload = () => { lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
          lightboxContent.appendChild(img);
          return;
        }
        const p = document.createElement('div');
        p.style.color = '#fff';
        p.textContent = 'Video not available';
        lightboxContent.appendChild(p);
        return;
      }

      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'metadata';
      Object.assign(video.style, { maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' });
      if (media.poster) video.setAttribute('poster', media.poster);

      const source = document.createElement('source');
      source.src = media.src;
      const ext = (media.src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4';
      else if (ext === 'webm') source.type = 'video/webm';
      video.appendChild(source);

      video.onloadedmetadata = () => {
        lightboxContent.style.minWidth = '';
        lightboxContent.style.minHeight = '';
      };
      lightboxContent.appendChild(video);
      video.play().catch(() => {});
    } else {
      const hi = media.srcHigh;
      const low = media.srcLow;
      const img = document.createElement('img');
      img.alt = item.getAttribute('aria-label') || '';
      Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' });

      if (low) {
        img.src = low;
        lightboxContent.appendChild(img);
      } else if (hi) {
        img.src = hi;
        lightboxContent.appendChild(img);
      } else {
        const p = document.createElement('div');
        p.style.color = '#fff';
        p.textContent = 'Image not available';
        lightboxContent.appendChild(p);
        return;
      }

      if (hi && hi !== low) {
        const hiImg = new Image();
        hiImg.src = hi;
        hiImg.onload = () => {
          img.src = hi;
          lightboxContent.style.width = '';
          lightboxContent.style.height = '';
          lightboxContent.style.minWidth = '';
          lightboxContent.style.minHeight = '';
        };
        hiImg.onerror = () => console.warn('pv.js: failed to load hi-res image for lightbox:', hi);
      } else {
        img.onload = () => {
          lightboxContent.style.width = '';
          lightboxContent.style.height = '';
          lightboxContent.style.minWidth = '';
          lightboxContent.style.minHeight = '';
        };
      }
    }
  }

  function hideLightbox() {
    if (!lightbox) return;
    lightbox.style.display = 'none';
    clearLightboxContent();
  }

  function onKeyDown(e) {
    if (!lightbox || lightbox.style.display !== 'flex') return;
    if (e.key === 'Escape') { hideLightbox(); return; }
    if (e.key === 'ArrowRight') {
      collectMediaItems();
      if (mediaItems.length === 0) return;
      currentIndex = (currentIndex + 1) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
    if (e.key === 'ArrowLeft') {
      collectMediaItems();
      if (mediaItems.length === 0) return;
      currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
  }

  // Delegated close handler for any .lightbox .close
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) {
      e.preventDefault();
      e.stopPropagation();
      hideLightbox();
    }
  });

  // ---------- Preloader (progress + skip after 5s) ----------
  function createPreloader() {
    const existing = document.getElementById('pv-preloader');
    if (existing) existing.remove();

    preloader = document.createElement('div');
    preloader.id = 'pv-preloader';
    preloader.className = 'pv-preloader';
    preloader.setAttribute('role', 'dialog');
    preloader.setAttribute('aria-label', 'Loading gallery');
    Object.assign(preloader.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
      transition: 'opacity 180ms ease'
    });

    const inner = document.createElement('div');
    inner.className = 'pv-preloader-inner';
    Object.assign(inner.style, {
      textAlign: 'center',
      color: '#fff',
      maxWidth: '92vw',
      width: '520px',
      padding: '22px',
      boxSizing: 'border-box',
      borderRadius: '10px',
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(6px)'
    });

    const spinner = document.createElement('div');
    spinner.className = 'pv-spinner';
    Object.assign(spinner.style, {
      width: '56px',
      height: '56px',
      margin: '8px auto 14px',
      borderRadius: '50%',
      border: '5px solid rgba(255,255,255,0.12)',
      borderTopColor: '#fff',
      animation: 'pv-spin 1s linear infinite'
    });

    progressEl = document.createElement('div');
    progressEl.className = 'pv-progress';
    Object.assign(progressEl.style, { margin: '10px auto', color: '#fff', fontWeight: '600' });
    progressEl.innerHTML = '<span class="pv-progress-percent">0%</span>';

    skipBtn = document.createElement('button');
    skipBtn.className = 'pv-skip';
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip';
    skipBtn.style.display = 'none';
    Object.assign(skipBtn.style, {
      marginTop: '14px', background: 'rgba(255,255,255,0.12)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.12)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
    });
    skipBtn.addEventListener('click', () => {
      skipShown = true;
      hidePreloaderImmediate();
    });

    inner.appendChild(spinner);
    inner.appendChild(progressEl);
    inner.appendChild(skipBtn);
    preloader.appendChild(inner);
    document.body.appendChild(preloader);

    // add minimal keyframe for spinner if not present
    if (!document.getElementById('pv-spin-style')) {
      const s = document.createElement('style');
      s.id = 'pv-spin-style';
      s.textContent = "@keyframes pv-spin { to { transform: rotate(360deg); } }";
      document.head.appendChild(s);
    }
  }

  function updatePreloaderProgress(loaded, total) {
    if (!progressEl) return;
    const pct = total === 0 ? 100 : Math.round((loaded / total) * 100);
    const pctSpan = progressEl.querySelector('.pv-progress-percent');
    if (pctSpan) pctSpan.textContent = `${pct}%`;
  }

  function showSkipAfterDelay(delayMs = 5000) {
    setTimeout(() => {
      if (!preloader || skipShown) return;
      if (preloader.style.display !== 'none') {
        skipBtn.style.display = 'inline-block';
      }
    }, delayMs);
  }

  function hidePreloaderImmediate() {
    if (!preloader) return;
    try {
      preloader.parentNode && preloader.parentNode.removeChild(preloader);
    } catch (e) {}
    preloader = null;
  }

  function hidePreloader() {
    if (!preloader) return;
    preloader.style.opacity = '0';
    setTimeout(() => {
      try { preloader.parentNode && preloader.parentNode.removeChild(preloader); } catch (e) {}
      preloader = null;
      // after the overlay is gone, do a couple of relayout ticks to stabilize masonry
      setTimeout(() => { layoutGrid(); requestAnimationFrame(layoutGrid); window.dispatchEvent(new Event('resize')); }, 40);
    }, 220);
  }

  function preloadGridMedia() {
    return new Promise((resolve) => {
      createPreloader();
      updatePreloaderProgress(0, 1);
      showSkipAfterDelay(5000);

      const imgEls = Array.from(grid.querySelectorAll('img'));
      const candidateVideoUrls = new Set();

      const tiles = Array.from(grid.querySelectorAll('.grid-item'));
      tiles.forEach(t => {
        if (t.dataset) {
          if (t.dataset.video) candidateVideoUrls.add(t.dataset.video);
          if (t.dataset.videoHigh) candidateVideoUrls.add(t.dataset.videoHigh);
        }
        const videoEl = t.querySelector('video');
        if (videoEl) {
          const sources = videoEl.querySelectorAll('source');
          sources.forEach(s => { if (s.src) candidateVideoUrls.add(s.src); });
          if (videoEl.src) candidateVideoUrls.add(videoEl.src);
        }
      });

      const images = imgEls.slice();
      const videos = Array.from(candidateVideoUrls).filter(Boolean);

      const total = images.length + videos.length;
      if (total === 0) {
        updatePreloaderProgress(1, 1);
        setTimeout(() => hidePreloader(), 200);
        resolve();
        return;
      }

      let loaded = 0;
      function markLoaded() {
        loaded += 1;
        updatePreloaderProgress(loaded, total);
        if (loaded >= total) {
          setTimeout(() => { hidePreloader(); resolve(); }, 250);
        }
      }

      images.forEach(img => {
        if (img.complete && img.naturalWidth !== 0) {
          markLoaded();
          return;
        }
        const onLoad = () => { cleanup(); markLoaded(); };
        const onError = () => { cleanup(); markLoaded(); };
        const cleanup = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        setTimeout(() => { if (!img.complete) { cleanup(); markLoaded(); } }, 30000);
      });

      if (videos.length > 0) {
        videos.forEach(url => {
          try {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;
            Object.assign(v.style, { position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: '0' });
            const onMeta = () => { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); };
            const onError = () => { cleanup(); try { v.remove(); } catch (e) {}; markLoaded(); };
            const cleanup = () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onError); };
            v.addEventListener('loadedmetadata', onMeta);
            v.addEventListener('error', onError);
            document.body.appendChild(v);
            v.src = url;
            setTimeout(() => {
              if (!v.readyState || v.readyState < 1) { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); }
            }, 30000);
          } catch (e) {
            markLoaded();
          }
        });
      }

      // Failsafe overall timeout
      setTimeout(() => {
        if (preloader) {
          console.warn('pv.js: preloader overall timeout — proceeding');
          hidePreloader();
          resolve();
        }
      }, 60000);
    });
  }

  // ---------- Masonry/grid layout ----------
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  function computeColumnWidth(containerWidth, cols) {
    if (!containerWidth || containerWidth < 10) {
      containerWidth = Math.max(containerWidth, Math.round(window.innerWidth * 0.9));
    }
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.round((containerWidth - totalGutters) / cols);
  }

  function computeRowSpan(item, rowHeightPx, gapPx) {
    const card = item.querySelector('.card') || item;
    const contentHeight = Math.ceil(card.getBoundingClientRect().height);
    return Math.max(1, Math.ceil((contentHeight + gapPx) / (rowHeightPx + gapPx)));
  }

  function layoutGrid() {
    const containerWidth = Math.round(grid.getBoundingClientRect().width);
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    grid.style.gridAutoRows = `${rowHeight}px`;
    grid.style.setProperty('--gutter', `${gutter}px`);
    grid.style.setProperty('--row-height', `${rowHeight}px`);

    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach(item => {
      let span = 1;
      const dataCol = parseInt(item.getAttribute('data-col'), 10);
      if (Number.isFinite(dataCol) && dataCol > 0) span = dataCol;
      if (item.classList.contains('grid-item--w4')) span = 4;
      if (item.classList.contains('grid-item--w3')) span = 3;
      if (item.classList.contains('grid-item--w2')) span = 2;
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;
      const rowSpan = computeRowSpan(item, rowHeight, gutter);
      item.style.gridRowEnd = `span ${rowSpan}`;
    });
  }

  // ---------- Media collection ----------
  function collectMediaItems() {
    mediaItems = Array.from(grid.querySelectorAll('.grid-item')).filter(item => {
      if (item.querySelector('img')) return true;
      if (item.dataset && (item.dataset.video || item.dataset.videoHigh || item.dataset.thumbLow || item.dataset.thumbHigh || item.dataset.high)) return true;
      return false;
    });
  }

  // ---------- Initialize and wiring ----------
  function init() {
    createLightbox();
    // Start preloader, then layout once resolved
    preloadGridMedia().then(() => {
      // ensure overlay removed and layout has a chance to settle — multiple ticks
      setTimeout(() => {
        layoutGrid();
        requestAnimationFrame(() => {
          layoutGrid();
          window.dispatchEvent(new Event('resize'));
        });
      }, 40);
      collectMediaItems();
    }).catch((e) => {
      console.warn('pv.js: preload rejected', e);
      layoutGrid();
      collectMediaItems();
    });

    // imagesLoaded style fallback: relayout after images have fully loaded
    if (typeof imagesLoaded === 'function') {
      imagesLoaded(grid, () => { layoutGrid(); requestAnimationFrame(layoutGrid); collectMediaItems(); });
    } else {
      // Basic fallback: after window load do a relayout
      window.addEventListener('load', () => { layoutGrid(); setTimeout(layoutGrid, 80); collectMediaItems(); });
    }

    // Watch for DOM changes in grid to relayout
    try {
      const mo = new MutationObserver(debounce(() => { layoutGrid(); collectMediaItems(); }, 120));
      mo.observe(grid, { childList: true, subtree: true, attributes: true });
    } catch (e) {
      // ignore if MutationObserver blocked
    }

    // Resize handling
    window.addEventListener('resize', debounce(() => { layoutGrid(); collectMediaItems(); }, 120));

    // Delegated click to open lightbox
    grid.addEventListener('click', (evt) => {
      const tile = evt.target.closest && evt.target.closest('.grid-item');
      if (!tile || !grid.contains(tile)) return;
      if (evt.target.closest && evt.target.closest('a')) return;
      collectMediaItems();
      const index = mediaItems.indexOf(tile);
      if (index === -1) return;
      showLightboxByIndex(index);
    });
  }

  // start init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // expose minimal helpers for debugging (optional)
  window._pv = {
    layoutGrid,
    showLightboxByIndex,
    hideLightbox,
    collectMediaItems
  };
})();
