// pv.js — robust lightbox + CSS-grid tiler
// Key change: if any existing #lightbox exists we REMOVE it and always create a fresh, known-good lightbox
// element appended to document.body. This avoids conflicts with pages that already have a different
// lightbox markup (e.g. an <img id="lightbox-img">) which caused 0x0 and non-functional UI.
//
// Behavior:
// - CSS Grid tiler (same as before) computes column/row spans.
// - Lightbox always created fresh (or recreated) on init; delegated click on .grid opens items.
// - Supports image tiles (img with data-high) and video tiles (data-video / data-video-high + data-thumb-*).
// - Ensures overlay is visible before loading hi-res media and gives sensible sizing so DevTools won't show 0x0.
// - Close button, overlay click, Escape key, and left/right arrows work reliably.
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

  // debounce helper
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  // Compute columns/widths
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }
  function computeColumnWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }

  // Column span requested by tile
  function getRequestedColSpan(item) {
    const dataCol = parseInt(item.getAttribute('data-col'), 10);
    if (Number.isFinite(dataCol) && dataCol > 0) return dataCol;
    if (item.classList.contains('grid-item--w4')) return 4;
    if (item.classList.contains('grid-item--w3')) return 3;
    if (item.classList.contains('grid-item--w2')) return 2;
    return 1;
  }

  // Row span measurement
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

  // ---------------------------
  // Robust Lightbox creation
  // ---------------------------
  let lightbox = null;
  let lightboxContent = null;
  let keydownAttached = false;
  let mediaItems = [];

  // If any existing #lightbox exists in the page, remove it - avoids conflicts.
  function removeExistingLightbox() {
    const existing = document.getElementById('lightbox');
    if (existing) {
      try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
    }
  }

  function createLightbox() {
    // Remove any previous instance to ensure a known-good structure
    removeExistingLightbox();

    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    // minimal inline styles — CSS file may augment these
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

    // content container that will hold <img> or <video>
    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    lightboxContent.style.boxSizing = 'border-box';
    // set defaults; script modifies these on open
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

    // compose
    lightbox.appendChild(closeBtn);
    lightbox.appendChild(lightboxContent);
    document.body.appendChild(lightbox);

    // handlers
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

  // Collect media tiles
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

  // Show item in lightbox by index (safe and robust)
  let currentIndex = 0;
  function showLightboxByIndex(index) {
    if (!lightbox || !lightboxContent) createLightbox();
    collectMediaItems();
    if (mediaItems.length === 0) return console.warn('No media items found in grid.');

    if (index < 0 || index >= mediaItems.length) {
      console.warn('index out of range', index);
      return;
    }
    currentIndex = index;
    clearLightboxContent();

    const item = mediaItems[index];
    const media = resolveMediaForItem(item);

    // Make overlay visible immediately so measurements work
    lightbox.style.display = 'flex';
    // force a visible size to avoid 0x0 (we remove later when media loaded)
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
      // try to play; may be blocked
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

  // keyboard nav
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

  // Delegated click on grid items
  grid.addEventListener('click', (evt) => {
    const tile = evt.target.closest && evt.target.closest('.grid-item');
    if (!tile || !grid.contains(tile)) return;
    if (evt.target.closest && evt.target.closest('a')) return;
    collectMediaItems();
    const index = mediaItems.indexOf(tile);
    if (index === -1) return;
    showLightboxByIndex(index);
  });

  // Ensure any .lightbox .close is handled (covers older markup if present)
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) {
      e.preventDefault();
      e.stopPropagation();
      hideLightbox();
    }
  });

  // Initialize: create known-good lightbox and layout
  createLightbox();
  // If imagesLoaded is available use it; otherwise do a safe tick after load
  if (typeof imagesLoaded === 'function') {
    imagesLoaded(grid, () => { layoutGrid(); requestAnimationFrame(layoutGrid); collectMediaItems(); });
  } else {
    window.addEventListener('load', () => { layoutGrid(); setTimeout(layoutGrid, 80); collectMediaItems(); });
  }
  window.addEventListener('resize', debounce(() => { layoutGrid(); collectMediaItems(); }, 120));
});
