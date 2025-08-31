// pv.js — Masonry grid + Preloader + Lightbox (all integrated)
// - Robust masonry using ResizeObserver / MutationObserver
// - Preloader overlay that waits for <img> and video metadata, shows percent, displays Skip after 5s
// - Lightbox for images and videos (removes existing #lightbox and creates a known-good one)
// - Defensive inline styles so other page CSS won't break things
(function () {
  // ---------- Configuration ----------
  const GUTTER = 12;           // px
  const MIN_COLUMN_WIDTH = 220; // px
  const MAX_COLUMNS = 5;
  const ROW_HEIGHT = 8;         // px
  const RELAYOUT_DEBOUNCE = 80; // ms
  const SKIP_DELAY_MS = 5000;
  const PRELOAD_TIMEOUT_MS = 60000;
  const DEBUG = false; // set true to log debug info

  // ---------- Utilities ----------
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function qs(sel, ctx = document) { return ctx.querySelector(sel); }
  function qsa(sel, ctx = document) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // ---------- Grid / Masonry Logic ----------
  const grid = qs('.grid');
  if (!grid) {
    console.warn('pv.js: .grid not found — aborting initialization.');
    return;
  }

  function enforceGridStyles(g) {

      (function () {
      const grid = document.querySelector('.grid');
      if (!grid) return;
      Array.from(grid.querySelectorAll('.grid-item')).forEach(item => {
        // inline styles to ensure the radius/clipping can't be overridden by other CSS
        item.style.borderRadius = item.style.borderRadius || '12px';
        item.style.overflow = item.style.overflow || 'hidden';
        item.style.boxSizing = item.style.boxSizing || 'border-box';
        // ensure the content wrapper (if any) inherits radius & clipping
        const card = item.querySelector('.card');
        if (card) {
          card.style.borderRadius = card.style.borderRadius || '12px';
          card.style.overflow = card.style.overflow || 'hidden';
          card.style.boxSizing = card.style.boxSizing || 'border-box';
        }
      });
    
      // ensure the lightbox content also gets radius/clip inline if present
      const lb = document.querySelector('.lightbox-content');
      if (lb) {
        lb.style.borderRadius = lb.style.borderRadius || '10px';
        lb.style.overflow = lb.style.overflow || 'hidden';
      }
    })();
        
    // Ensure container is CSS grid and set safe defaults
    g.style.display = 'grid';
    g.style.gridAutoFlow = 'row dense';
    g.style.gap = `${GUTTER}px`;
    g.style.gridAutoRows = `${ROW_HEIGHT}px`;
    // Normalize children and images
    qsa('.grid-item', g).forEach(item => {
      item.style.boxSizing = item.style.boxSizing || 'border-box';
      item.style.width = item.style.width || 'auto';
      item.style.position = item.style.position || 'relative';
      item.style.removeProperty('min-width');
      item.style.removeProperty('max-width');
      const card = qs('.card', item);
      if (card) card.style.boxSizing = card.style.boxSizing || 'border-box';
    });
    qsa('img', g).forEach(img => {
      img.style.display = img.style.display || 'block';
      img.style.width = img.style.width || '100%';
      img.style.height = img.style.height || 'auto';
      img.style.objectFit = img.style.objectFit || 'cover';
      img.style.boxSizing = img.style.boxSizing || 'border-box';
    });
  }

  function getEffectiveContainerWidth(g) {
    try {
      const rect = g.getBoundingClientRect();
      if (rect && rect.width >= 50) return Math.round(rect.width);
      // fallback to ancestor width
      let a = g.parentElement;
      while (a) {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        if (r && r.width >= 50 && cs.display !== 'none' && cs.visibility !== 'hidden') return Math.round(r.width);
        a = a.parentElement;
      }
      // final fallback to viewport
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

  function setItemRowSpan(g, item) {
    if (!item) return;
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
      // set column span based on data-col or classes
      let span = 1;
      const dataCol = parseInt(item.getAttribute('data-col'), 10);
      if (Number.isFinite(dataCol) && dataCol > 0) span = dataCol;
      if (item.classList.contains('grid-item--w4')) span = 4;
      if (item.classList.contains('grid-item--w3')) span = 3;
      if (item.classList.contains('grid-item--w2')) span = 2;
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;
      setItemRowSpan(g, item);
    });
  }

  // ---------- Observers ----------
  function attachObservers(g) {
    // ResizeObserver for content changes
    let ro;
    try {
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(entries => {
          window.requestAnimationFrame(() => {
            entries.forEach(entry => {
              const el = entry.target;
              const itm = el.closest('.grid-item') || el;
              setItemRowSpan(g, itm);
            });
          });
        });
        qsa('.grid-item', g).forEach(item => {
          const target = qs('.card', item) || item;
          try { ro.observe(target); } catch (e) { /* ignore */ }
        });
      }
    } catch (e) {
      ro = null;
    }

    // MutationObserver to observe new items added
    try {
      const mo = new MutationObserver(muts => {
        let added = false;
        muts.forEach(m => {
          (m.addedNodes || []).forEach(node => {
            if (node.nodeType === 1 && node.classList && node.classList.contains('grid-item')) {
              added = true;
              // normalize images inside new node
              qsa('img', node).forEach(img => {
                img.style.display = img.style.display || 'block';
                img.style.width = img.style.width || '100%';
                img.style.height = img.style.height || 'auto';
                img.addEventListener('load', () => setItemRowSpan(g, node));
                img.addEventListener('error', () => setItemRowSpan(g, node));
              });
              const target = qs('.card', node) || node;
              if (ro) try { ro.observe(target); } catch (e) {}
              setItemRowSpan(g, node);
            }
          });
        });
        if (added) relayoutAll(g);
      });
      mo.observe(g, { childList: true, subtree: true, attributes: false });
    } catch (e) { /* ignore */ }

    // Ensure existing images update their item spans on load
    qsa('img', g).forEach(img => {
      img.addEventListener('load', () => {
        const itm = img.closest('.grid-item');
        if (itm) setItemRowSpan(g, itm);
      });
      img.addEventListener('error', () => {
        const itm = img.closest('.grid-item');
        if (itm) setItemRowSpan(g, itm);
      });
    });

    // Relayout on window resize
    window.addEventListener('resize', debounce(() => relayoutAll(g), RELAYOUT_DEBOUNCE));
  }

  // ---------- Preloader (progress + Skip) ----------
  let preloaderEl = null;
  let progressEl = null;
  let skipBtn = null;
  let preloaderActive = false;

  function createPreloader() {
    const existing = document.getElementById('pv-preloader');
    if (existing) existing.remove();
    const pre = document.createElement('div');
    pre.id = 'pv-preloader';
    Object.assign(pre.style, {
      position: 'fixed', inset: '0', zIndex: 2147483647, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)',
      transition: 'opacity 180ms ease'
    });
    const inner = document.createElement('div');
    Object.assign(inner.style, {
      textAlign: 'center', color: '#fff', maxWidth: '92vw', width: '520px',
      padding: '22px', boxSizing: 'border-box', borderRadius: '10px',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)'
    });
    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
      width: '56px', height: '56px', margin: '8px auto 14px', borderRadius: '50%',
      border: '5px solid rgba(255,255,255,0.12)', borderTopColor: '#fff',
      animation: 'pv-spin 1s linear infinite'
    });
    const styleId = 'pv-spin-style';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style'); s.id = styleId;
      s.textContent = '@keyframes pv-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(s);
    }
    progressEl = document.createElement('div');
    progressEl.style.margin = '10px auto';
    progressEl.style.color = '#fff';
    progressEl.style.fontWeight = '600';
    progressEl.innerHTML = '<span class="pv-progress-percent">0%</span>';
    skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip';
    skipBtn.style.display = 'none';
    Object.assign(skipBtn.style, {
      marginTop: '14px', background: 'rgba(255,255,255,0.12)', color: '#fff',
      border: '1px solid rgba(255,255,255,0.12)', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer',
      fontWeight: '600'
    });
    skipBtn.addEventListener('click', () => {
      hidePreloaderImmediate();
    });

    inner.appendChild(spinner);
    inner.appendChild(progressEl);
    inner.appendChild(skipBtn);
    pre.appendChild(inner);
    document.body.appendChild(pre);

    preloaderEl = pre;
    preloaderActive = true;

    // show skip after delay
    setTimeout(() => {
      if (preloaderEl && preloaderActive) skipBtn.style.display = 'inline-block';
    }, SKIP_DELAY_MS);
  }

  function updatePreloader(loaded, total) {
    if (!progressEl) return;
    const pct = total === 0 ? 100 : Math.round((loaded / total) * 100);
    const span = progressEl.querySelector('.pv-progress-percent');
    if (span) span.textContent = `${pct}%`;
  }

  function hidePreloaderImmediate() {
    if (!preloaderEl) return;
    try { preloaderEl.remove(); } catch (e) {}
    preloaderEl = null;
    preloaderActive = false;
    // relayout after preloader is removed
    setTimeout(() => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); }, 40);
  }
  function hidePreloaderSmooth() {
    if (!preloaderEl) return;
    preloaderEl.style.opacity = '0';
    setTimeout(() => {
      try { preloaderEl.remove(); } catch (e) {}
      preloaderEl = null;
      preloaderActive = false;
      setTimeout(() => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); }, 40);
    }, 220);
  }

  function preloadGridMedia() {
    return new Promise(resolve => {
      // create overlay
      createPreloader();
      updatePreloader(0, 1);

      // collect images and video urls
      const images = qsa('img', grid);
      const videoUrls = new Set();
      qsa('.grid-item', grid).forEach(item => {
        const ds = item.dataset || {};
        if (ds.video) videoUrls.add(ds.video);
        if (ds.videoHigh) videoUrls.add(ds.videoHigh);
        // inline <video> in tile
        qsa('video source', item).forEach(s => s.src && videoUrls.add(s.src));
        const v = qs('video', item);
        if (v && v.src) videoUrls.add(v.src);
      });

      const videos = Array.from(videoUrls).filter(Boolean);
      const total = images.length + videos.length;
      if (total === 0) {
        updatePreloader(1, 1);
        setTimeout(() => hidePreloaderSmooth(), 200);
        resolve();
        return;
      }

      let loaded = 0;
      function markLoaded() {
        loaded += 1;
        updatePreloader(loaded, total);
        if (loaded >= total) {
          setTimeout(() => { hidePreloaderSmooth(); resolve(); }, 250);
        }
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
          } catch (e) {
            markLoaded();
          }
        });
      }

      // overall failsafe
      setTimeout(() => {
        if (preloaderEl) {
          console.warn('pv.js: preloader timeout reached; proceeding.');
          hidePreloaderSmooth();
          resolve();
        }
      }, PRELOAD_TIMEOUT_MS);
    });
  }

  // ---------- Lightbox ----------
  let lightbox = null;
  let lightboxContent = null;
  let currentIndex = 0;
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
    Object.assign(lightbox.style, {
      position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
      display: 'none', zIndex: 2147483646, background: 'rgba(0,0,0,0.85)',
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
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, { position: 'absolute', top: '12px', right: '16px', fontSize: '30px', color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer', zIndex: '10' });

    lightbox.appendChild(closeBtn);
    lightbox.appendChild(lightboxContent);
    document.body.appendChild(lightbox);

    closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); hideLightbox(); });
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) hideLightbox(); });

    document.addEventListener('keydown', (e) => {
      if (!lightbox || lightbox.style.display !== 'flex') return;
      if (e.key === 'Escape') { hideLightbox(); return; }
      if (e.key === 'ArrowRight') { navigateLightbox(1); }
      if (e.key === 'ArrowLeft') { navigateLightbox(-1); }
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
    if (!lightbox || !lightboxContent) createLightbox();
    collectMediaItems();
    if (mediaItems.length === 0) return;
    if (idx < 0) idx = 0;
    if (idx >= mediaItems.length) idx = mediaItems.length - 1;
    currentIndex = idx;
    lightboxContent.innerHTML = '';
    lightbox.style.display = 'flex';

    const item = mediaItems[currentIndex];
    const media = resolveMediaForItem(item);
    // force a visible container size while media loads
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
          const img = document.createElement('img'); img.src = media.poster; img.alt = item.getAttribute('aria-label') || ''; Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%' });
          img.onload = () => { lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
          lightboxContent.appendChild(img); return;
        }
        const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Video not available'; lightboxContent.appendChild(p); return;
      }
      const video = document.createElement('video');
      video.controls = true; video.playsInline = true; video.autoplay = true; video.preload = 'metadata';
      Object.assign(video.style, { maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' });
      if (media.poster) video.setAttribute('poster', media.poster);
      const source = document.createElement('source'); source.src = media.src;
      const ext = (media.src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4'; else if (ext === 'webm') source.type = 'video/webm';
      video.appendChild(source);
      video.onloadedmetadata = () => { lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
      lightboxContent.appendChild(video);
      video.play().catch(()=>{});
    } else {
      const hi = media.srcHigh;
      const low = media.srcLow;
      const img = document.createElement('img');
      img.alt = item.getAttribute('aria-label') || '';
      Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' });
      if (low) { img.src = low; lightboxContent.appendChild(img); } else if (hi) { img.src = hi; lightboxContent.appendChild(img); } else { const p = document.createElement('div'); p.style.color = '#fff'; p.textContent = 'Image not available'; lightboxContent.appendChild(p); return; }
      if (hi && hi !== low) {
        const hiImg = new Image(); hiImg.src = hi;
        hiImg.onload = () => { img.src = hi; lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
        hiImg.onerror = () => console.warn('pv.js: failed to load hi-res image:', hi);
      } else {
        img.onload = () => { lightboxContent.style.width = ''; lightboxContent.style.height = ''; lightboxContent.style.minWidth = ''; lightboxContent.style.minHeight = ''; };
      }
    }
  }

  function navigateLightbox(delta) {
    collectMediaItems();
    if (mediaItems.length === 0) return;
    currentIndex = (currentIndex + delta + mediaItems.length) % mediaItems.length;
    showLightboxByIndex(currentIndex);
  }

  function hideLightbox() {
    if (!lightbox) return;
    lightbox.style.display = 'none';
    if (lightboxContent) lightboxContent.innerHTML = '';
  }

  // Delegated click to open lightbox
  grid.addEventListener('click', (evt) => {
    const tile = evt.target.closest && evt.target.closest('.grid-item');
    if (!tile || !grid.contains(tile)) return;
    if (evt.target.closest && evt.target.closest('a')) return;
    collectMediaItems();
    const idx = mediaItems.indexOf(tile);
    if (idx === -1) return;
    showLightboxByIndex(idx);
  });

  // ensure any .lightbox .close works (covers preexisting markup)
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) { e.preventDefault(); e.stopPropagation(); hideLightbox(); }
  });

  // ---------- Initialization sequence ----------
  function init() {
    // create lightbox early so it's present and predictable
    createLightbox();
    // ensure grid normalized immediately
    enforceGridStyles(grid);
    attachObservers(grid);

    // Preload media (shows preloader). After preload finishes, run robust relayout ticks.
    preloadGridMedia().then(() => {
      // wait a tick for preloader removal and browser to settle
      setTimeout(() => {
        relayoutAll(grid);
        requestAnimationFrame(() => {
          relayoutAll(grid);
          // dispatch a resize so other listeners sync up
          window.dispatchEvent(new Event('resize'));
        });
      }, 40);
      // collect media items for lightbox navigation
      collectMediaItems();
    }).catch((err) => {
      console.warn('pv.js: preload error', err);
      relayoutAll(grid);
      collectMediaItems();
    });

    // imagesLoaded fallback behavior: when images settle, recompute
    if (typeof imagesLoaded === 'function') {
      imagesLoaded(grid, () => { relayoutAll(grid); requestAnimationFrame(() => relayoutAll(grid)); collectMediaItems(); });
    } else {
      window.addEventListener('load', () => { relayoutAll(grid); setTimeout(() => relayoutAll(grid), 80); collectMediaItems(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // expose helpers for debugging
  window._pv = {
    relayoutAll: () => relayoutAll(grid),
    showLightboxByIndex,
    hideLightbox,
    collectMediaItems
  };
})();
