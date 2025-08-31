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

  // Compute how many columns fit the container width
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  // Compute pixel width for each column (accounting for gutters)
  function computeColumnWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }

  // Determine desired column-span for an item (from data attribute or classes)
  function getRequestedColSpan(item) {
    const dataCol = parseInt(item.getAttribute('data-col'), 10);
    if (Number.isFinite(dataCol) && dataCol > 0) return dataCol;
    if (item.classList.contains('grid-item--w4')) return 4;
    if (item.classList.contains('grid-item--w3')) return 3;
    if (item.classList.contains('grid-item--w2')) return 2;
    return 1;
  }

  // Measure card height and compute rowSpan
  function computeRowSpan(item, rowHeightPx, gapPx) {
    const card = item.querySelector('.card') || item;
    // Use getBoundingClientRect for sub-pixel accuracy
    const contentHeight = Math.ceil(card.getBoundingClientRect().height);
    // row span formula: ceil( (height + gap) / (rowHeight + gap) )
    return Math.max(1, Math.ceil((contentHeight + gapPx) / (rowHeightPx + gapPx)));
  }

  // Main layout function: sets grid columns, auto-rows and computes spans for items
  function layoutGrid() {
    const containerWidth = grid.clientWidth;
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);

    // apply grid template columns and auto-rows (pixel-controlled)
    grid.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    grid.style.gridAutoRows = `${rowHeight}px`;
    grid.style.setProperty('--gutter', `${gutter}px`);
    grid.style.setProperty('--row-height', `${rowHeight}px`);

    // place items: set grid-column span and grid-row span
    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach(item => {
      // requested column span (clamped)
      let span = getRequestedColSpan(item);
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;

      // compute and apply row span based on item content height
      const rowSpan = computeRowSpan(item, rowHeight, gutter);
      item.style.gridRowEnd = `span ${rowSpan}`;
    });
  }

  // Re-apply layout after images load (ensures heights are correct)
  imagesLoaded(grid, () => {
    layoutGrid();
    // A second layout tick in case fonts/images/async content changed sizes
    requestAnimationFrame(() => layoutGrid());
  });

  // Relayout on resize (debounced)
  window.addEventListener('resize', debounce(() => {
    layoutGrid();
  }, 120));

  /* -------------------------
     Lightbox with image & video support
     - Supports low-res thumbnails for grid tiles and high-res sources for the lightbox
     - Expected data attributes on .grid-item (video example):
         data-video="<low-or-medium-video-url>"           (optional)
         data-video-high="<high-resolution-video-url>"   (preferred source for lightbox)
         data-thumb-low="<low-res-thumbnail-url>"        (used for grid if not using <img>)
         data-thumb-high="<high-res-image-for-lightbox>" (optional poster for video or hi-res image)
     - For images:
         <img src="thumb-low.jpg" data-high="image-high.jpg"> OR
         .grid-item data-thumb-low / data-thumb-high
  ------------------------- */

  const lightbox = document.getElementById("lightbox");
  const lightboxContent = lightbox ? lightbox.querySelector('.lightbox-content') : null;
  const closeBtn = document.querySelector(".lightbox .close");
  let mediaItems = []; // array of .grid-item that contain media (images or videos)
  let currentIndex = 0;

  function collectMediaItems() {
    // any grid-item that has either an <img> or a data-video or data-thumb-low/high counts as media
    mediaItems = Array.from(grid.querySelectorAll('.grid-item')).filter(item => {
      if (item.querySelector('img')) return true;
      if (item.dataset && (item.dataset.video || item.dataset.videoHigh || item.dataset.thumbLow || item.dataset.thumbHigh || item.dataset.high)) return true;
      return false;
    });
  }

  // Utility: clear the lightbox content and stop/pause any playing video
  function clearLightboxContent() {
    if (!lightboxContent) return;
    // stop any existing video playback and remove nodes
    const video = lightboxContent.querySelector('video');
    if (video) {
      try {
        video.pause();
        // remove sources to stop download/playing on some browsers
        video.removeAttribute('src');
        while (video.firstChild) video.removeChild(video.firstChild);
      } catch (e) { /* ignore */ }
    }
    lightboxContent.innerHTML = '';
  }

  // Show the lightbox for a given media index
  function showLightboxByIndex(index) {
    if (!lightbox || !lightboxContent) return;
    if (index < 0 || index >= mediaItems.length) return;
    currentIndex = index;
    clearLightboxContent();

    const item = mediaItems[index];
    // prefer explicit dataset flags
    const data = item.dataset || {};

    // helper to pick high-res fallback:
    // possible attributes: data-video-high, data-video, data-thumb-high, data-high, <img data-high>, <img.src>
    const imgEl = item.querySelector('img');

    const isVideo = !!(data.video || data.videoHigh);
    if (isVideo) {
      // prefer data-video-high for playback in lightbox, fallback to data-video
      const srcHigh = data.videoHigh || data.video;
      // poster can be data-thumb-high or data-thumb-low or imgEl.dataset.high or imgEl.src
      const poster = data.thumbHigh || data.thumbLow || (imgEl && (imgEl.dataset && imgEl.dataset.high)) || (imgEl && imgEl.src) || '';

      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'metadata';
      video.style.maxWidth = '90vw';
      video.style.maxHeight = '80vh';
      video.style.width = 'auto';
      video.style.height = 'auto';
      if (poster) video.setAttribute('poster', poster);

      // create source element
      const source = document.createElement('source');
      source.src = srcHigh;
      // try to infer type from extension (optional)
      const ext = (srcHigh.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4';
      else if (ext === 'webm') source.type = 'video/webm';

      video.appendChild(source);
      lightboxContent.appendChild(video);

      // attempt to play (some browsers require user gesture; autoplay may be blocked)
      video.play().catch(() => {
        // autoplay failed (likely blocked). User can hit play.
      });

    } else {
      // image path resolution: prefer data-thumb-high or data-high or the img[data-high] or img.src
      const hi = data.thumbHigh || data.high || (imgEl && (imgEl.dataset && imgEl.dataset.high)) || (imgEl && imgEl.src) || '';
      const img = document.createElement('img');
      img.style.maxWidth = '90vw';
      img.style.maxHeight = '80vh';
      img.style.width = 'auto';
      img.style.height = 'auto';
      img.alt = item.getAttribute('aria-label') || '';

      // If we have a hi-res, use it; otherwise fall back to the low-res thumb if present
      img.src = hi || data.thumbLow || (imgEl && imgEl.src) || '';
      lightboxContent.appendChild(img);
    }

    // show lightbox
    lightbox.style.display = "flex";
  }

  function hideLightbox() {
    if (!lightbox) return;
    lightbox.style.display = "none";
    clearLightboxContent();
  }

  // keyboard navigation and close handling
  function onKeyDown(e) {
    if (!lightbox || lightbox.style.display !== "flex") return;
    if (e.key === "Escape") {
      hideLightbox();
      return;
    }
    if (e.key === "ArrowRight") {
      currentIndex = (currentIndex + 1) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
    if (e.key === "ArrowLeft") {
      currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
  }

  // Attach lightbox event handlers
  if (lightbox) {
    if (closeBtn) closeBtn.addEventListener('click', hideLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) hideLightbox(); });
    document.addEventListener('keydown', onKeyDown);
  }

  // Build clickable media list and attach click handlers to grid items
  function bindGridClickHandlers() {
    collectMediaItems();
    mediaItems.forEach((item, i) => {
      // ensure cursor indicates clickability
      item.style.cursor = 'pointer';

      // If an inner <a> should handle navigation, you might want to skip default behavior.
      item.addEventListener('click', (evt) => {
        // If click landed on a link inside the tile, let it through
        const isLink = evt.target.closest && evt.target.closest('a');
        if (isLink) return;

        // Open the high-res media (image or video) in the lightbox
        showLightboxByIndex(i);
      });
    });
  }

  // Initialize media handlers once initial layout & images are loaded
  imagesLoaded(grid, () => {
    layoutGrid();
    requestAnimationFrame(() => {
      layoutGrid();
      bindGridClickHandlers();
    });
  });

  // also re-bind handlers on relayout in case DOM changes
  window.addEventListener('resize', debounce(() => {
    layoutGrid();
    collectMediaItems();
  }, 120));
});
