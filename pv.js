// pv.js — Masonry + Preloader + Lightbox (fixed: no cropping of portrait images)
// - Uses a lightbox-inner wrapper and sets max-width/max-height instead of forcing width/height
// - Media elements use object-fit: contain and never both width/height 100%
// - Retains masonry logic (ResizeObserver-based) and preloader behavior

(function () {
  const GUTTER = 12;
  const MIN_COLUMN_WIDTH = 220;
  const MAX_COLUMNS = 5;
  const ROW_HEIGHT = 8;
  const RELAYOUT_DEBOUNCE = 80;
  const SKIP_DELAY_MS = 5000;
  const PRELOAD_TIMEOUT_MS = 60000;
  const DEBUG = false;

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  function qs(sel, ctx = document) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx = document) { return Array.from((ctx || document).querySelectorAll(sel)); }

  const grid = qs('.grid');
  if (!grid) { console.warn('pv.js: .grid not found — aborting.'); return; }

  // ---------- Styling normalization ----------
  function enforceGridStyles(g) {
    if (!g) return;
    g.style.display = g.style.display || 'grid';
    g.style.gridAutoFlow = g.style.gridAutoFlow || 'row dense';
    g.style.gap = g.style.gap || `${GUTTER}px`;
    g.style.gridAutoRows = g.style.gridAutoRows || `${ROW_HEIGHT}px`;

    qsa('.grid-item', g).forEach(item => {
      item.style.boxSizing = item.style.boxSizing || 'border-box';
      item.style.width = item.style.width || 'auto';
      item.style.position = item.style.position || 'relative';
      item.style.removeProperty('min-width');
      item.style.removeProperty('max-width');
      item.style.overflow = item.style.overflow || 'hidden';
      item.style.background = item.style.background || 'transparent';
      const card = qs('.card', item);
      if (card) card.style.boxSizing = card.style.boxSizing || 'border-box';
    });

    qsa('img', g).forEach(img => {
      img.style.display = img.style.display || 'block';
      img.style.width = img.style.width || '100%';
      img.style.height = img.style.height || 'auto';
      img.style.objectFit = img.style.objectFit || 'cover';
      img.style.boxSizing = img.style.boxSizing || 'border-box';
      img.style.margin = img.style.margin || '0';
      img.style.verticalAlign = img.style.verticalAlign || 'middle';
      try { if (!img.decoding) img.decoding = 'async'; } catch (e) {}
    });
  }

  // ---------- Grid math ----------
  function getEffectiveContainerWidth(g) {
    try {
      const rect = g.getBoundingClientRect();
      const gw = rect && rect.width ? Math.round(rect.width) : 0;
      if (gw >= 50) return gw;
      let a = g.parentElement;
      while (a) {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        if (r && r.width >= 50 && cs.display !== 'none' && cs.visibility !== 'hidden') return Math.round(r.width);
        a = a.parentElement;
      }
      return Math.round(window.innerWidth * 0.95);
    } catch (e) {
      return Math.round(window.innerWidth * 0.95);
    }
  }

  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + GUTTER) / (MIN_COLUMN_WIDTH + GUTTER));
    return Math.max(1, Math.min(cols, MAX_COLUMNS));
  }
  function computeColumnWidth(containerWidth, cols) {
    if (!containerWidth || containerWidth < 10) containerWidth = Math.round(window.innerWidth * 0.95);
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * GUTTER;
    return Math.round((containerWidth - totalGutters) / cols);
  }

  // ---------- Row-span measurement ----------
  function setItemRowSpan(g, item, colWidth) {
    // if colWidth not provided compute quickly
    if (!colWidth) {
      const containerWidth = getEffectiveContainerWidth(g);
      const cols = computeColumns(containerWidth);
      colWidth = computeColumnWidth(containerWidth, cols);
    }

    const spanAttr = parseInt(item.getAttribute('data-col'), 10);
    let colSpan = 1;
    if (Number.isFinite(spanAttr) && spanAttr > 0) colSpan = spanAttr;
    if (item.classList.contains('grid-item--w4')) colSpan = 4;
    if (item.classList.contains('grid-item--w3')) colSpan = 3;
    if (item.classList.contains('grid-item--w2')) colSpan = 2;

    // If tile has an image, compute desired display height using natural ratio and col width
    const img = qs('img', item);
    if (img && (img.naturalWidth || img.naturalHeight)) {
      const naturalW = img.naturalWidth || img.width || 1;
      const naturalH = img.naturalHeight || img.height || 1;
      const displayWidth = (colWidth * colSpan) + ((colSpan - 1) * GUTTER);
      const displayHeight = Math.ceil(displayWidth * (naturalH / naturalW));
      // choose object-fit based on orientation: tall images use 'contain' so they don't crop
      if (naturalH / naturalW > 1.25) {
        img.style.objectFit = 'contain';
        // when using contain, ensure we don't force width:100% for tile image (use max-width)
        img.style.width = 'auto';
        img.style.height = 'auto';
        // set the card height to the displayHeight so the tile gets that height
        const card = qs('.card', item) || item;
        // If card has other content, measure it after layout; but for image-only tiles, set a min-height
        if (!card.dataset.preserveHeight) {
          card.style.minHeight = `${displayHeight}px`;
        }
      } else {
        // landscape or near-square: keep cover for mosaic fill
        img.style.objectFit = 'cover';
        img.style.width = '100%';
        img.style.height = 'auto';
        const card = qs('.card', item) || item;
        // remove minHeight if previously set
        if (card && card.style && card.style.minHeight) {
          card.style.removeProperty('min-height');
        }
      }
    }

    // Finally measure the item's actual rendered height and set grid-row span
    const card = qs('.card', item) || item;
    const height = Math.ceil((card.getBoundingClientRect && card.getBoundingClientRect().height) || card.offsetHeight || 0);
    const span = Math.max(1, Math.ceil((height + GUTTER) / (ROW_HEIGHT + GUTTER)));
    item.style.gridRowEnd = `span ${span}`;
  }

  function relayoutAll(g) {
    if (!g) return;
    enforceGridStyles(g);
    const containerWidth = getEffectiveContainerWidth(g);
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);
    if (DEBUG) console.log('pv.js relayout', { containerWidth, cols, colWidth });
    g.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    g.style.gridAutoRows = `${ROW_HEIGHT}px`;

    qsa('.grid-item', g).forEach(item => {
      item.style.width = item.style.width || 'auto';
      item.style.boxSizing = item.style.boxSizing || 'border-box';
      let span = 1;
      const dataCol = parseInt(item.getAttribute('data-col'), 10);
      if (Number.isFinite(dataCol) && dataCol > 0) span = dataCol;
      if (item.classList.contains('grid-item--w4')) span = 4;
      if (item.classList.contains('grid-item--w3')) span = 3;
      if (item.classList.contains('grid-item--w2')) span = 2;
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;
      setItemRowSpan(g, item, colWidth);
    });
  }

  // ---------- Observers ----------
  function attachObservers(g) {
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(entries => {
          window.requestAnimationFrame(() => {
            const containerWidth = getEffectiveContainerWidth(g);
            const cols = computeColumns(containerWidth);
            const colWidth = computeColumnWidth(containerWidth, cols);
            entries.forEach(entry => {
              const el = entry.target;
              const itm = el.closest('.grid-item') || el;
              setItemRowSpan(g, itm, colWidth);
            });
          });
        });
        qsa('.grid-item', g).forEach(item => {
          const target = qs('.card', item) || item;
          try { ro.observe(target); } catch (e) {}
        });
      } catch (e) { ro = null; }
    }

    try {
      const mo = new MutationObserver(muts => {
        let added = false;
        muts.forEach(m => {
          (m.addedNodes || []).forEach(node => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('grid-item')) {
              added = true;
              qsa('img', node).forEach(img => {
                img.style.display = img.style.display || 'block';
                img.style.width = img.style.width || '100%';
                img.style.height = img.style.height || 'auto';
                img.addEventListener('load', () => {
                  const containerWidth = getEffectiveContainerWidth(g);
                  const cols = computeColumns(containerWidth);
                  const colWidth = computeColumnWidth(containerWidth, cols);
                  setItemRowSpan(g, node, colWidth);
                });
                img.addEventListener('error', () => {
                  const containerWidth = getEffectiveContainerWidth(g);
                  const cols = computeColumns(containerWidth);
                  const colWidth = computeColumnWidth(containerWidth, cols);
                  setItemRowSpan(g, node, colWidth);
                });
              });
              const target = qs('.card', node) || node;
              if (ro) try { ro.observe(target); } catch (e) {}
              // initial span
              const containerWidth = getEffectiveContainerWidth(g);
              const cols = computeColumns(containerWidth);
              const colWidth = computeColumnWidth(containerWidth, cols);
              setItemRowSpan(g, node, colWidth);
            }
          });
        });
        if (added) relayoutAll(g);
      });
      mo.observe(g, { childList: true, subtree: true, attributes: false });
    } catch (e) {}

    qsa('img', g).forEach(img => {
      img.addEventListener('load', () => {
        const containerWidth = getEffectiveContainerWidth(g);
        const cols = computeColumns(containerWidth);
        const colWidth = computeColumnWidth(containerWidth, cols);
        const itm = img.closest('.grid-item');
        if (itm) setItemRowSpan(g, itm, colWidth);
      });
      img.addEventListener('error', () => {
        const containerWidth = getEffectiveContainerWidth(g);
        const cols = computeColumns(containerWidth);
        const colWidth = computeColumnWidth(containerWidth, cols);
        const itm = img.closest('.grid-item');
        if (itm) setItemRowSpan(g, itm, colWidth);
      });
    });

    window.addEventListener('resize', debounce(() => relayoutAll(g), RELAYOUT_DEBOUNCE));
  }

  // ---------- Preloader (unchanged) ----------
  let preloaderEl = null;
  let progressEl = null;
  let skipBtn = null;
  let preloaderActive = false;
  function createPreloader() {
    const existing = document.getElementById('pv-preloader'); if (existing) existing.remove();
    const pre = document.createElement('div'); pre.id = 'pv-preloader'; pre.className = 'pv-preloader';
    Object.assign(pre.style, { position: 'fixed', inset: '0', zIndex: 2147483647, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', transition: 'opacity 180ms ease' });
    const inner = document.createElement('div'); inner.className = 'pv-preloader-inner';
    Object.assign(inner.style, { textAlign: 'center', color: '#fff', maxWidth: '92vw', width: '520px', padding: '22px', boxSizing: 'border-box', borderRadius: '12px', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' });
    const spinner = document.createElement('div'); spinner.className = 'pv-spinner';
    Object.assign(spinner.style, { width: '56px', height: '56px', margin: '8px auto 14px', borderRadius: '50%', border: '5px solid rgba(255,255,255,0.12)', borderTopColor: '#fff', animation: 'pv-spin 1s linear infinite' });
    const styleId = 'pv-spin-style'; if (!document.getElementById(styleId)) { const s = document.createElement('style'); s.id = styleId; s.textContent = '@keyframes pv-spin { to { transform: rotate(360deg); } }'; document.head.appendChild(s); }
    progressEl = document.createElement('div'); progressEl.className = 'pv-progress'; progressEl.style.margin = '10px auto'; progressEl.style.color = '#fff'; progressEl.style.fontWeight = '600'; progressEl.innerHTML = '<span class="pv-progress-percent">0%</span>';
    skipBtn = document.createElement('button'); skipBtn.className = 'pv-skip'; skipBtn.type = 'button'; skipBtn.textContent = 'Skip'; skipBtn.style.display = 'none';
    Object.assign(skipBtn.style, { marginTop: '14px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' });
    skipBtn.addEventListener('click', () => hidePreloaderImmediate());
    inner.appendChild(spinner); inner.appendChild(progressEl); inner.appendChild(skipBtn); pre.appendChild(inner); document.body.appendChild(pre);
    preloaderEl = pre; preloaderActive = true;
    setTimeout(() => { if (preloaderEl && preloaderActive) skipBtn.style.display = 'inline-block'; }, SKIP_DELAY_MS);
  }
  function updatePreloader(loaded, total) { if (!progressEl) return; const pct = total === 0 ? 100 : Math.round((loaded / total) * 100); const span = progressEl.querySelector('.pv-progress-percent'); if (span) span.textContent = `${pct}%`; }
  function hidePreloaderImmediate() { if (!preloaderEl) return; try { preloaderEl.remove(); } catch (e) {} preloaderEl = null; preloaderActive = false; setTimeout(() => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); }, 40); }
  function hidePreloaderSmooth() { if (!preloaderEl) return; preloaderEl.style.opacity = '0'; setTimeout(() => { try { preloaderEl.remove(); } catch (e) {} preloaderEl = null; preloaderActive = false; setTimeout(() => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); }, 40); }, 220); }
  function preloadGridMedia() {
    return new Promise(resolve => {
      createPreloader();
      updatePreloader(0, 1);
      const images = qsa('img', grid);
      const videoUrls = new Set();
      qsa('.grid-item', grid).forEach(item => {
        const ds = item.dataset || {};
        if (ds.video) videoUrls.add(ds.video);
        if (ds.videoHigh) videoUrls.add(ds.videoHigh);
        qsa('video source', item).forEach(s => s.src && videoUrls.add(s.src));
        const v = qs('video', item); if (v && v.src) videoUrls.add(v.src);
      });
      const videos = Array.from(videoUrls).filter(Boolean);
      const total = images.length + videos.length;
      if (total === 0) { updatePreloader(1,1); setTimeout(() => hidePreloaderSmooth(), 200); resolve(); return; }
      let loaded = 0;
      function markLoaded() { loaded += 1; updatePreloader(loaded, total); if (loaded >= total) { setTimeout(() => { hidePreloaderSmooth(); resolve(); }, 250); } }
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
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.muted = true;
            Object.assign(v.style, { position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: '0' });
            const onMeta = () => { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); };
            const onError = () => { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); };
            const cleanup = () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('error', onError); };
            v.addEventListener('loadedmetadata', onMeta);
            v.addEventListener('error', onError);
            document.body.appendChild(v);
            v.src = url;
            setTimeout(() => { if (!v.readyState || v.readyState < 1) { cleanup(); try { v.remove(); } catch (e) {} ; markLoaded(); } }, 30000);
          } catch (e) { markLoaded(); }
        });
      }
      setTimeout(() => {
        if (preloaderEl) { console.warn('pv.js: preloader timeout reached; proceeding.'); hidePreloaderSmooth(); resolve(); }
      }, PRELOAD_TIMEOUT_MS);
    });
  }

  // ---------- Lightbox (use inner wrapper to avoid forcing size) ----------
  let lightbox = null;
  let lightboxContent = null;
  let lightboxInner = null;
  let mediaItems = [];
  let currentIndex = 0;

  function removeExistingLightbox() { const existing = document.getElementById('lightbox'); if (existing) existing.remove(); }

  function createLightbox() {
    removeExistingLightbox();
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    Object.assign(lightbox.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', display: 'none', zIndex: 2147483646, background: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box', overflow: 'auto' });

    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    Object.assign(lightboxContent.style, { boxSizing: 'border-box', position: 'relative', borderRadius: '10px', overflow: 'visible', padding: '8px' });

    // inner wrapper constrains media and can scroll
    lightboxInner = document.createElement('div');
    lightboxInner.className = 'lightbox-inner';
    Object.assign(lightboxInner.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', background: '#000', borderRadius: '10px' });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, { position: 'absolute', top: '12px', right: '16px', fontSize: '30px', color: '#fff', background: 'rgba(0,0,0,0.25)', borderRadius: '999px', width: '44px', height: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', zIndex: '14' });

    lightboxContent.appendChild(lightboxInner);
    lightbox.appendChild(closeBtn);
    lightbox.appendChild(lightboxContent);
    document.body.appendChild(lightbox);

    closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); hideLightbox(); });
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) hideLightbox(); });

    document.addEventListener('keydown', (e) => {
      if (!lightbox || lightbox.style.display !== 'flex') return;
      if (e.key === 'Escape') { hideLightbox(); return; }
      if (e.key === 'ArrowRight') navigateLightbox(1);
      if (e.key === 'ArrowLeft') navigateLightbox(-1);
    });
  }

  function collectMediaItems() {
    mediaItems = qsa('.grid-item', grid).filter(item => {
      if (qs('img', item)) return true;
      if (item.dataset && (item.dataset.video || item.dataset.videoHigh || item.dataset.thumbLow || item.dataset.thumbHigh || item.dataset.high)) return true;
      return false;
    });
  }

  function resolveMediaForItem(item) {
    const data = item.dataset || {};
    const imgEl = qs('img', item);
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

  function showLightboxByIndex(idx) {
    if (!lightbox || !lightboxInner) createLightbox();
    collectMediaItems();
    if (mediaItems.length === 0) return;
    if (idx < 0) idx = 0;
    if (idx >= mediaItems.length) idx = mediaItems.length - 1;
    currentIndex = idx;

    // clear and show
    lightboxInner.innerHTML = '';
    lightbox.style.display = 'flex';

    const item = mediaItems[currentIndex];
    const media = resolveMediaForItem(item);
    const size = computeLightboxSize();
    // set inner wrapper max sizes (do not set fixed width/height)
    lightboxInner.style.maxWidth = `${size.w}px`;
    lightboxInner.style.maxHeight = `${size.h}px`;

    if (!media || !media.type) {
      const p = document.createElement('div'); p.style.color = '#fff'; p.style.padding = '12px'; p.textContent = 'No preview available'; lightboxInner.appendChild(p); return;
    }

    if (media.type === 'video') {
      if (!media.src) {
        if (media.poster) {
          const img = document.createElement('img'); img.src = media.poster; img.alt = item.getAttribute('aria-label') || '';
          Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' });
          img.onload = () => { /* let CSS handle sizing */ };
          lightboxInner.appendChild(img); return;
        }
        const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Video not available'; lightboxInner.appendChild(p); return;
      }
      const video = document.createElement('video');
      video.controls = true; video.playsInline = true; video.autoplay = true; video.preload = 'metadata';
      Object.assign(video.style, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' });
      if (media.poster) video.setAttribute('poster', media.poster);
      const source = document.createElement('source'); source.src = media.src;
      const ext = (media.src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4'; else if (ext === 'webm') source.type = 'video/webm';
      video.appendChild(source);
      video.onloadedmetadata = () => {};
      lightboxInner.appendChild(video);
      video.play().catch(()=>{});
      return;
    }

    // Image case - prefer hi-res
    const hi = media.srcHigh;
    const low = media.srcLow;
    const img = document.createElement('img');
    img.alt = item.getAttribute('aria-label') || '';
    Object.assign(img.style, { display: 'block', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', margin: '0 auto' });
    img.decoding = 'async';

    // Load hi-res immediately if present
    if (hi) {
      img.src = hi;
      lightboxInner.appendChild(img);
      const loader = new Image();
      loader.src = hi;
      loader.onload = () => { /* CSS and wrapper handle sizing */ };
      loader.onerror = () => { if (low) img.src = low; };
    } else if (low) {
      img.src = low;
      lightboxInner.appendChild(img);
    } else {
      const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Image not available'; lightboxInner.appendChild(p); return;
    }
  }

  function navigateLightbox(delta) {
    collectMediaItems();
    if (mediaItems.length === 0) return;
    currentIndex = (currentIndex + delta + mediaItems.length) % mediaItems.length;
    showLightboxByIndex(currentIndex);
  }

  function hideLightbox() { if (!lightbox) return; lightbox.style.display = 'none'; if (lightboxInner) lightboxInner.innerHTML = ''; }

  // delegated open
  grid.addEventListener('click', (evt) => {
    const tile = evt.target.closest && evt.target.closest('.grid-item');
    if (!tile || !grid.contains(tile)) return;
    if (evt.target.closest && evt.target.closest('a')) return;
    collectMediaItems();
    const idx = mediaItems.indexOf(tile);
    if (idx === -1) return;
    showLightboxByIndex(idx);
  });
  // delegated close helper
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) { e.preventDefault(); e.stopPropagation(); hideLightbox(); }
  });

  // ---------- Init ----------
  function init() {
    createLightbox();
    enforceGridStyles(grid);
    attachObservers(grid);

    preloadGridMedia().then(() => {
      setTimeout(() => {
        relayoutAll(grid);
        requestAnimationFrame(() => { relayoutAll(grid); window.dispatchEvent(new Event('resize')); });
      }, 40);
      collectMediaItems();
    }).catch((err) => {
      console.warn('pv.js: preload error', err);
      relayoutAll(grid);
      collectMediaItems();
    });

    if (typeof imagesLoaded === 'function') {
      imagesLoaded(grid, () => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); collectMediaItems(); });
    } else {
      window.addEventListener('load', () => { relayoutAll(grid); setTimeout(() => relayoutAll(grid), 80); collectMediaItems(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // helpers
  window._pv = { relayoutAll: () => relayoutAll(grid), showLightboxByIndex, hideLightbox, collectMediaItems };
})();
