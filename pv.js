// pv.js — improved container-width detection to avoid 1-column collapse
// Includes masonry grid, preloader, and lightbox (as before) but with robust width detection.

(function () {
  // ---------- Config ----------
  const gutter = 12;           // px
  const minColumnWidth = 220;  // px
  const maxColumns = 5;
  const rowHeight = 8;         // px
  const DEBUG = true; // set true to see console diagnostics

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

  // ---------- Helpers to robustly compute container width ----------
  function isVisible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  // Find the first ancestor with a measurable width (>= minWidthThreshold)
  function findAncestorWithWidth(el, minWidthThreshold = 50) {
    let a = el.parentElement;
    while (a) {
      try {
        const rect = a.getBoundingClientRect();
        if (rect && rect.width >= minWidthThreshold && isVisible(a)) {
          return { el: a, width: rect.width };
        }
      } catch (e) {
        // some cross-origin frames or stylesheets may throw, ignore
      }
      a = a.parentElement;
    }
    return null;
  }

  // Use multiple fallbacks to return a reliable container width
  function getEffectiveContainerWidth() {
    try {
      const rect = grid.getBoundingClientRect();
      const gw = rect && rect.width ? Math.round(rect.width) : 0;
      if (gw >= 50) {
        if (DEBUG) console.log('pv.js: grid.getBoundingClientRect().width =', gw);
        return gw;
      }
      // try ancestors
      const anc = findAncestorWithWidth(grid, 50);
      if (anc) {
        if (DEBUG) console.log('pv.js: falling back to ancestor width', anc.width, anc.el);
        return Math.round(anc.width);
      }
      // fallback to viewport-based width minus typical body margins/padding
      const vp = Math.round(window.innerWidth * 0.95);
      if (DEBUG) console.warn('pv.js: grid width small or zero; falling back to viewport width', vp);
      return vp;
    } catch (e) {
      const fallback = Math.round(window.innerWidth * 0.95);
      console.warn('pv.js: error measuring grid width — using fallback', fallback, e);
      return fallback;
    }
  }

  // ---------- Lightbox (unchanged core, but kept here) ----------
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
    Object.assign(lightbox.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      display: 'none', zIndex: '2147483646', background: 'rgba(0,0,0,0.85)',
      justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box', overflow: 'auto'
    });

    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    Object.assign(lightboxContent.style, {
      boxSizing: 'border-box', minWidth: '160px', minHeight: '120px',
      maxWidth: '90vw', maxHeight: '80vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', position: 'relative'
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close'; closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close'); closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, { position: 'absolute', top: '12px', right: '16px', fontSize: '30px', color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: '10' });

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
      try { video.pause(); video.removeAttribute('src'); while (video.firstChild) video.removeChild(video.firstChild); } catch (e) {}
    }
    lightboxContent.innerHTML = '';
    lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = '160px'; lightboxContent.style.minHeight = '120px';
  }

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
      const p = document.createElement('div'); p.style.color = '#fff'; p.style.padding = '12px'; p.textContent = 'No preview available'; lightboxContent.appendChild(p); return;
    }

    if (media.type === 'video') {
      if (!media.src) {
        if (media.poster) {
          const img = document.createElement('img'); img.src = media.poster; img.alt = item.getAttribute('aria-label') || '';
          Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%' });
          img.onload = () => { lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
          lightboxContent.appendChild(img);
          return;
        }
        const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Video not available'; lightboxContent.appendChild(p); return;
      }

      const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.autoplay = true; video.preload = 'metadata';
      Object.assign(video.style, { maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' });
      if (media.poster) video.setAttribute('poster', media.poster);
      const source = document.createElement('source'); source.src = media.src;
      const ext = (media.src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4'; else if (ext === 'webm') source.type = 'video/webm';
      video.appendChild(source);
      video.onloadedmetadata = () => { lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
      lightboxContent.appendChild(video);
      video.play().catch(() => {});
    } else {
      const hi = media.srcHigh; const low = media.srcLow;
      const img = document.createElement('img'); img.alt = item.getAttribute('aria-label') || '';
      Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' });
      if (low) { img.src = low; lightboxContent.appendChild(img); } else if (hi) { img.src = hi; lightboxContent.appendChild(img); } else { const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Image not available'; lightboxContent.appendChild(p); return; }
      if (hi && hi !== low) {
        const hiImg = new Image(); hiImg.src = hi; hiImg.onload = () => { img.src = hi; lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
        hiImg.onerror = () => console.warn('pv.js: failed to load hi-res image for lightbox:', hi);
      } else {
        img.onload = () => { lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
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
    if (e.key === 'ArrowRight') { collectMediaItems(); if (mediaItems.length === 0) return; currentIndex = (currentIndex + 1) % mediaItems.length; showLightboxByIndex(currentIndex); }
    if (e.key === 'ArrowLeft') { collectMediaItems(); if (mediaItems.length === 0) return; currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length; showLightboxByIndex(currentIndex); }
  }

  // Delegated close handler for any .lightbox .close
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) {
      e.preventDefault(); e.stopPropagation(); hideLightbox();
    }
  });

  // ---------- Preloader (unchanged core) ----------
  function createPreloader() {
    const existing = document.getElementById('pv-preloader');
    if (existing) existing.remove();
    preloader = document.createElement('div'); preloader.id = 'pv-preloader'; preloader.className = 'pv-preloader';
    Object.assign(preloader.style, { position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', transition: 'opacity 180ms ease' });
    const inner = document.createElement('div'); inner.className = 'pv-preloader-inner'; Object.assign(inner.style, { textAlign: 'center', color: '#fff', maxWidth: '92vw', width: '520px', padding: '22px', boxSizing: 'border-box', borderRadius: '10px', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' });
    const spinner = document.createElement('div'); spinner.className = 'pv-spinner'; Object.assign(spinner.style, { width: '56px', height: '56px', margin: '8px auto 14px', borderRadius: '50%', border: '5px solid rgba(255,255,255,0.12)', borderTopColor: '#fff', animation: 'pv-spin 1s linear infinite' });
    progressEl = document.createElement('div'); progressEl.className = 'pv-progress'; Object.assign(progressEl.style, { margin: '10px auto', color: '#fff', fontWeight: '600' }); progressEl.innerHTML = '<span class="pv-progress-percent">0%</span>';
    skipBtn = document.createElement('button'); skipBtn.className = 'pv-skip'; skipBtn.type = 'button'; skipBtn.textContent = 'Skip'; skipBtn.style.display = 'none';
    Object.assign(skipBtn.style, { marginTop: '14px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' });
    skipBtn.addEventListener('click', () => { skipShown = true; hidePreloaderImmediate(); });
    inner.appendChild(spinner); inner.appendChild(progressEl); inner.appendChild(skipBtn); preloader.appendChild(inner); document.body.appendChild(preloader);
    if (!document.getElementById('pv-spin-style')) { const s = document.createElement('style'); s.id = 'pv-spin-style'; s.textContent = "@keyframes pv-spin { to { transform: rotate(360deg); } }"; document.head.appendChild(s); }
  }

  function updatePreloaderProgress(loaded, total) {
    if (!progressEl) return;
    const pct = total === 0 ? 100 : Math.round((loaded / total) * 100);
    const pctSpan = progressEl.querySelector('.pv-progress-percent');
    if (pctSpan) pctSpan.textContent = `${pct}%`;
  }

  function showSkipAfterDelay(delayMs = 5000) {
    setTimeout(() => { if (!preloader || skipShown) return; if (preloader.style.display !== 'none') skipBtn.style.display = 'inline-block'; }, delayMs);
  }

  function hidePreloaderImmediate() { if (!preloader) return; try { preloader.parentNode && preloader.parentNode.removeChild(preloader); } catch (e) {} preloader = null; setTimeout(() => { layoutGrid(); requestAnimationFrame(layoutGrid); window.dispatchEvent(new Event('resize')); }, 40); }

  function hidePreloader() { if (!preloader) return; preloader.style.opacity = '0'; setTimeout(() => { try { preloader.parentNode && preloader.parentNode.removeChild(preloader); } catch (e) {} preloader = null; setTimeout(() => { layoutGrid(); requestAnimationFrame(layoutGrid); window.dispatchEvent(new Event('resize')); }, 40); }, 220); }

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
      if (total === 0) { updatePreloaderProgress(1, 1); setTimeout(() => hidePreloader(), 200); resolve(); return; }

      let loaded = 0;
      function markLoaded() {
        loaded += 1;
        updatePreloaderProgress(loaded, total);
        if (loaded >= total) { setTimeout(() => { hidePreloader(); resolve(); }, 250); }
      }

      images.forEach(img => {
        if (img.complete && img.naturalWidth !== 0) { markLoaded(); return; }
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
            const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
            Object.assign(v.style, { position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: '0' });
            const onMeta = () => { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); };
            const onError = () => { cleanup(); try { v.remove(); } catch (e) {}; markLoaded(); };
            const cleanup = () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onError); };
            v.addEventListener('loadedmetadata', onMeta);
            v.addEventListener('error', onError);
            document.body.appendChild(v);
            v.src = url;
            setTimeout(() => { if (!v.readyState || v.readyState < 1) { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); } }, 30000);
          } catch (e) { markLoaded(); }
        });
      }

      setTimeout(() => { if (preloader) { console.warn('pv.js: preloader overall timeout — proceeding'); hidePreloader(); resolve(); } }, 60000);
    });
  }

  // ---------- Masonry/grid layout (uses getEffectiveContainerWidth) ----------
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  function computeColumnWidth(containerWidth, cols) {
    if (!containerWidth || containerWidth < 10) {
      containerWidth = Math.max(containerWidth, Math.round(window.innerWidth * 0.95));
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
    // robust width detection
    const containerWidth = getEffectiveContainerWidth();
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);

    if (DEBUG) console.log('pv.js: layoutGrid -> containerWidth=', containerWidth, 'cols=', cols, 'colWidth=', colWidth);

    // If we detect a single column but viewport is wide, log a warning to help debugging
    if (cols === 1 && window.innerWidth > minColumnWidth + 200) {
      console.warn('pv.js: computed 1 column (cols=1). This can happen when the grid is temporarily measured as small; using fallback viewport width if needed.');
    }

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
    preloadGridMedia().then(() => {
      setTimeout(() => {
        layoutGrid();
        requestAnimationFrame(() => { layoutGrid(); window.dispatchEvent(new Event('resize')); });
      }, 40);
      collectMediaItems();
    }).catch((e) => {
      console.warn('pv.js: preload rejected', e);
      layoutGrid();
      collectMediaItems();
    });

    if (typeof imagesLoaded === 'function') {
      imagesLoaded(grid, () => { layoutGrid(); requestAnimationFrame(layoutGrid); collectMediaItems(); });
    } else {
      window.addEventListener('load', () => { layoutGrid(); setTimeout(layoutGrid, 80); collectMediaItems(); });
    }

    try {
      const mo = new MutationObserver(debounce(() => { layoutGrid(); collectMediaItems(); }, 120));
      mo.observe(grid, { childList: true, subtree: true, attributes: true });
    } catch (e) {}

    window.addEventListener('resize', debounce(() => { layoutGrid(); collectMediaItems(); }, 120));

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window._pv = { layoutGrid, showLightboxByIndex, hideLightbox, collectMediaItems, getEffectiveContainerWidth };
})();
