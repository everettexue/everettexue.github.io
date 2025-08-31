// pv.js — adds a page preloader that waits for grid images and videos to load,
// shows progress, and reveals a "Skip" button after 5 seconds to dismiss the loader.
// Integrates with the existing grid tiler + lightbox code.
//
// Drop this file in place of your existing pv.js
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector('.grid');
  const gutter = 12;           // px — keep in sync with CSS --gutter
  const minColumnWidth = 220;  // px — controls when columns collapse
  const maxColumns = 5;        // maximum columns
  const rowHeight = 8;         // px — base row unit; keep in sync with CSS --row-height

  if (!grid) {
    console.warn('No .grid element found — tiler will not initialize.');
    return;
  }

  // ----------------------------
  // Preloader overlay
  // ----------------------------
  let preloader = null;
  let progressEl = null;
  let skipBtn = null;
  let skipShown = false;
  let preloadPromiseResolve = null;
  let preloadPromiseReject = null;
  let aborted = false;

  function createPreloader() {
    // If present already, remove to create a clean one
    const existing = document.getElementById('pv-preloader');
    if (existing) existing.remove();

    preloader = document.createElement('div');
    preloader.id = 'pv-preloader';
    preloader.className = 'pv-preloader';
    preloader.setAttribute('role', 'dialog');
    preloader.setAttribute('aria-label', 'Loading gallery');

    const inner = document.createElement('div');
    inner.className = 'pv-preloader-inner';

    const spinner = document.createElement('div');
    spinner.className = 'pv-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    progressEl = document.createElement('div');
    progressEl.className = 'pv-progress';
    progressEl.innerHTML = '<span class="pv-progress-percent">0%</span>';

    skipBtn = document.createElement('button');
    skipBtn.className = 'pv-skip';
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip';
    skipBtn.style.display = 'none';
    skipBtn.addEventListener('click', () => {
      skipShown = true;
      hidePreloader();
    });

    inner.appendChild(spinner);
    inner.appendChild(progressEl);
    inner.appendChild(skipBtn);
    preloader.appendChild(inner);
    document.body.appendChild(preloader);
  }

  function updatePreloaderProgress(loaded, total) {
    if (!progressEl) return;
    const pct = total === 0 ? 100 : Math.round((loaded / total) * 100);
    const pctSpan = progressEl.querySelector('.pv-progress-percent');
    if (pctSpan) pctSpan.textContent = `${pct}%`;
    progressEl.style.setProperty('--pv-progress-pct', `${pct}%`);
  }

  function showSkipAfterDelay(delayMs = 5000) {
    setTimeout(() => {
      if (!preloader || skipShown) return;
      // Only show if still visible (i.e., loading not finished)
      if (preloader.style.display !== 'none') {
        skipBtn.style.display = 'inline-block';
      }
    }, delayMs);
  }

  function hidePreloader() {
    // hide overlay; resolve preload promise so rest of init continues
    if (!preloader) return;
    preloader.style.opacity = '0';
    // small timeout to allow CSS transition
    setTimeout(() => {
      if (preloader && preloader.parentNode) preloader.parentNode.removeChild(preloader);
      preloader = null;
      if (preloadPromiseResolve) {
        preloadPromiseResolve();
        preloadPromiseResolve = null;
        preloadPromiseReject = null;
      }
    }, 220);
  }

  // Preload grid images and referenced videos (metadata only)
  function preloadGridMedia() {
    return new Promise((resolve, reject) => {
      preloadPromiseResolve = resolve;
      preloadPromiseReject = reject;
      createPreloader();
      updatePreloaderProgress(0, 1); // initial small visible progress
      showSkipAfterDelay(5000);

      // collect images (<img>) inside grid and any video URLs from data attributes
      const imgEls = Array.from(grid.querySelectorAll('img'));
      const candidateVideoUrls = new Set();

      // look for data-video / data-video-high attributes on grid-item elements
      const tiles = Array.from(grid.querySelectorAll('.grid-item'));
      tiles.forEach(t => {
        if (t.dataset) {
          if (t.dataset.video) candidateVideoUrls.add(t.dataset.video);
          if (t.dataset.videoHigh) candidateVideoUrls.add(t.dataset.videoHigh);
        }
        // also check for <video> elements inside tiles (rare)
        const videoEl = t.querySelector('video');
        if (videoEl) {
          const sources = videoEl.querySelectorAll('source');
          sources.forEach(s => { if (s.src) candidateVideoUrls.add(s.src); });
          if (videoEl.src) candidateVideoUrls.add(videoEl.src);
        }
      });

      // unify lists
      const images = imgEls.slice(); // array of <img>
      const videos = Array.from(candidateVideoUrls).filter(Boolean);

      const total = images.length + videos.length;
      if (total === 0) {
        // no media to load — hide and resolve quickly
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
          // small delay to ensure user sees 100%
          setTimeout(() => { if (!skipShown) hidePreloader(); else hidePreloader(); }, 250);
        }
      }

      // Image loading
      images.forEach(img => {
        // If image is already loaded (cached), consider it done
        if (img.complete && img.naturalWidth !== 0) {
          markLoaded();
          return;
        }
        // Otherwise attach listeners
        const onLoad = () => { cleanup(); markLoaded(); };
        const onError = () => { cleanup(); markLoaded(); };
        const cleanup = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);
        // as an extra safeguard, if image doesn't load within 30s, treat as loaded
        setTimeout(() => { if (!img.complete) { cleanup(); markLoaded(); } }, 30000);
      });

      // Video metadata loading (use hidden Video elements to load metadata only)
      if (videos.length === 0) {
        // if only images, resolve by checking images completion (above)
        // Wait until loaded === total then resolve
      } else {
        videos.forEach(url => {
          try {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;
            v.style.position = 'absolute';
            v.style.left = '-9999px';
            v.style.width = '1px';
            v.style.height = '1px';
            v.style.opacity = '0';
            // attach events
            const onMeta = () => { cleanup(); markLoaded(); v.remove(); };
            const onError = () => { cleanup(); markLoaded(); v.remove(); };
            const cleanup = () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onError); };
            v.addEventListener('loadedmetadata', onMeta);
            v.addEventListener('error', onError);
            // append to body temporarily so loading works in some browsers
            document.body.appendChild(v);
            v.src = url;
            // fallback timeout
            setTimeout(() => {
              if (!v.readyState || v.readyState < 1) {
                cleanup();
                try { v.remove(); } catch (e) {}
                markLoaded();
              }
            }, 30000);
          } catch (e) {
            // if creating/using video fails, just mark as loaded
            markLoaded();
          }
        });
      }

      // Poll for completion: when loaded reaches total, resolve.
      const poll = setInterval(() => {
        if (loaded >= total) {
          clearInterval(poll);
          // extra short delay for UX
          setTimeout(() => {
            if (!skipShown) {
              // hide preloader (and resolve)
              hidePreloader();
            } else {
              hidePreloader();
            }
            resolve();
          }, 250);
        }
      }, 120);

      // If the user clicks Skip we want to immediately resolve (hide overlay)
      // skip button handler already calls hidePreloader which resolves the promise
      // But in case of any error/timeouts, ensure we don't hang: set an overall max timeout (e.g., 60s)
      setTimeout(() => {
        if (loaded < total) {
          console.warn('Preloader: overall timeout reached — proceeding anyway.');
          hidePreloader();
          resolve();
        }
      }, 60000);
    });
  }

  // ----------------------------
  // Grid tiler (unchanged)
  // ----------------------------
  // debounce helper
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }
  function computeColumnWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }
  function getRequestedColSpan(item) {
    const dataCol = parseInt(item.getAttribute('data-col'), 10);
    if (Number.isFinite(dataCol) && dataCol > 0) return dataCol;
    if (item.classList.contains('grid-item--w4')) return 4;
    if (item.classList.contains('grid-item--w3')) return 3;
    if (item.classList.contains('grid-item--w2')) return 2;
    return 1;
  }
  function computeRowSpan(item, rowHeightPx, gapPx) {
    const card = item.querySelector('.card') || item;
    const contentHeight = Math.ceil(card.getBoundingClientRect().height);
    return Math.max(1, Math.ceil((contentHeight + gapPx) / (rowHeightPx + gapPx)));
  }
  function layoutGrid() {
    const containerWidth = grid.clientWidth;
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    grid.style.gridAutoRows = `${rowHeight}px`;
    grid.style.setProperty('--gutter', `${gutter}px`);
    grid.style.setProperty('--row-height', `${rowHeight}px`);
    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach(item => {
      let span = getRequestedColSpan(item);
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;
      const rowSpan = computeRowSpan(item, rowHeight, gutter);
      item.style.gridRowEnd = `span ${rowSpan}`;
    });
  }

  // ----------------------------
  // Lightbox (reused from prior robust implementation)
  // ----------------------------
  let lightbox = null;
  let lightboxContent = null;
  let keydownAttached = false;
  let mediaItems = [];

  function removeExistingLightbox() {
    const existing = document.getElementById('lightbox');
    if (existing) existing.remove();
  }
  function createLightbox() {
    removeExistingLightbox();
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.style.position = 'fixed';
    lightbox.style.left = '0';
    lightbox.style.top = '0';
    lightbox.style.width = '100%';
    lightbox.style.height = '100%';
    lightbox.style.display = 'none';
    lightbox.style.zIndex = '2147483646';
    lightbox.style.background = 'rgba(0,0,0,0.85)';
    lightbox.style.justifyContent = 'center';
    lightbox.style.alignItems = 'center';
    lightbox.style.padding = '20px';
    lightbox.style.boxSizing = 'border-box';
    lightbox.style.overflow = 'auto';

    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    lightboxContent.style.boxSizing = 'border-box';
    lightboxContent.style.minWidth = '160px';
    lightboxContent.style.minHeight = '120px';
    lightboxContent.style.maxWidth = '90vw';
    lightboxContent.style.maxHeight = '80vh';
    lightboxContent.style.display = 'flex';
    lightboxContent.style.alignItems = 'center';
    lightboxContent.style.justifyContent = 'center';
    lightboxContent.style.position = 'relative';
    lightboxContent.style.background = 'transparent';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '16px';
    closeBtn.style.fontSize = '30px';
    closeBtn.style.color = '#fff';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = '10';

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

  function collectMediaItems() {
    mediaItems = Array.from(grid.querySelectorAll('.grid-item')).filter(item => {
      if (item.querySelector('img')) return true;
      if (item.dataset && (item.dataset.video || item.dataset.videoHigh || item.dataset.thumbLow || item.dataset.thumbHigh || item.dataset.high)) return true;
      return false;
    });
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
    if (mediaItems.length === 0) return console.warn('No media items found in grid.');
    if (index < 0 || index >= mediaItems.length) return console.warn('index out of range', index);
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
      video.style.maxWidth = '100%';
      video.style.maxHeight = '100%';
      video.style.width = '100%';
      video.style.height = '100%';
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
      video.play().catch(()=>{});
    } else {
      const hi = media.srcHigh;
      const low = media.srcLow;
      const img = document.createElement('img');
      img.alt = item.getAttribute('aria-label') || '';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.width = 'auto';
      img.style.height = 'auto';

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
        hiImg.onerror = () => console.warn('failed to load hi-res image for lightbox:', hi);
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

  grid.addEventListener('click', (evt) => {
    const tile = evt.target.closest && evt.target.closest('.grid-item');
    if (!tile || !grid.contains(tile)) return;
    if (evt.target.closest && evt.target.closest('a')) return;
    collectMediaItems();
    const index = mediaItems.indexOf(tile);
    if (index === -1) return;
    showLightboxByIndex(index);
  });

  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) {
      e.preventDefault();
      e.stopPropagation();
      hideLightbox();
    }
  });

  // Initialize: preloader -> layout -> bindings
  createLightbox();
  preloadGridMedia().then(() => {
    // Once preloader promise resolves (either loads finished or skipped/timed out), run layout
    layoutGrid();
    requestAnimationFrame(layoutGrid);
    collectMediaItems();
  }).catch((err) => {
    console.warn('Preloader promise rejected:', err);
    // still continue
    layoutGrid();
    requestAnimationFrame(layoutGrid);
    collectMediaItems();
  });

  // window resize relayout
  window.addEventListener('resize', debounce(() => { layoutGrid(); collectMediaItems(); }, 120));
});
