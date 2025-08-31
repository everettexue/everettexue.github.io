// pv.js — updated: ensure lightbox content isn't 0x0 by showing overlay early,
// using a temporary min size and listening for image/video load events.
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

  // ---------------------------------------------------------------------------
  // Lightbox: create if missing, safe clear, show by index, delegated click handler
  // ---------------------------------------------------------------------------

  let lightbox = document.getElementById("lightbox");
  let lightboxContent = lightbox ? lightbox.querySelector('.lightbox-content') : null;
  let keydownAttached = false;

  function createLightboxIfMissing() {
    if (lightbox && lightboxContent) return; // already present
    // create overlay
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.style.display = 'none';
    lightbox.style.justifyContent = 'center';
    lightbox.style.alignItems = 'center';
    lightbox.style.position = 'fixed';
    lightbox.style.left = '0';
    lightbox.style.top = '0';
    lightbox.style.width = '100%';
    lightbox.style.height = '100%';
    lightbox.style.zIndex = '999';
    lightbox.style.background = 'rgba(0,0,0,0.85)';
    lightbox.style.padding = '24px';
    lightbox.style.boxSizing = 'border-box';
    // content container
    lightboxContent = document.createElement('div');
    lightboxContent.className = 'lightbox-content';
    // important: allow the container to size to children, but give a small fallback min size
    lightboxContent.style.maxWidth = '90%';
    lightboxContent.style.maxHeight = '80%';
    lightboxContent.style.display = 'flex';
    lightboxContent.style.alignItems = 'center';
    lightboxContent.style.justifyContent = 'center';
    lightboxContent.style.position = 'relative';
    // give a tiny min to avoid 0x0 while the media loads
    lightboxContent.style.minWidth = '160px';
    lightboxContent.style.minHeight = '120px';

    // close button (explicit type and accessible attributes)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '×';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '18px';
    closeBtn.style.right = '22px';
    closeBtn.style.fontSize = '34px';
    closeBtn.style.color = '#fff';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.setAttribute('aria-label', 'Close');

    lightbox.appendChild(closeBtn);
    lightbox.appendChild(lightboxContent);
    document.body.appendChild(lightbox);

    // attach handlers for this specific close button (defensive)
    closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideLightbox();
    });

    // click on overlay to close
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) hideLightbox(); });

    // attach keydown handler only once globally
    if (!keydownAttached) {
      document.addEventListener('keydown', onKeyDown);
      keydownAttached = true;
    }
  }

  // Utility: clear the lightbox content and stop/pause any playing video
  function clearLightboxContent() {
    if (!lightboxContent) return;
    // stop any existing video playback and remove nodes
    const video = lightboxContent.querySelector('video');
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        while (video.firstChild) video.removeChild(video.firstChild);
      } catch (e) { /* ignore */ }
    }
    lightboxContent.innerHTML = '';
    // restore a small min-size so the container isn't 0x0 if reopened quickly
    lightboxContent.style.minWidth = '160px';
    lightboxContent.style.minHeight = '120px';
  }

  // Collect media items (images or videos)
  let mediaItems = []; // will hold elements
  function collectMediaItems() {
    mediaItems = Array.from(grid.querySelectorAll('.grid-item')).filter(item => {
      if (item.querySelector('img')) return true;
      if (item.dataset && (item.dataset.video || item.dataset.videoHigh || item.dataset.thumbLow || item.dataset.thumbHigh || item.dataset.high)) return true;
      return false;
    });
  }

  // helpers to resolve media for a tile element
  function resolveMediaForItem(item) {
    const data = item.dataset || {};
    const imgEl = item.querySelector('img');

    const isVideo = !!(data.video || data.videoHigh);
    if (isVideo) {
      const srcHigh = data.videoHigh || data.video || '';
      const poster = data.thumbHigh || data.thumbLow || (imgEl && imgEl.dataset && imgEl.dataset.high) || (imgEl && imgEl.src) || '';
      return { type: 'video', src: srcHigh, poster };
    } else {
      // image: prefer data-thumb-high / data-high / img[data-high] / img.src
      const hi = data.thumbHigh || data.high || (imgEl && imgEl.dataset && imgEl.dataset.high) || (imgEl && imgEl.src) || '';
      const low = data.thumbLow || (imgEl && imgEl.src) || '';
      return { type: 'image', srcHigh: hi, srcLow: low };
    }
  }

  // Show the lightbox for a given media index
  let currentIndex = 0;
  function showLightboxByIndex(index) {
    createLightboxIfMissing();
    if (!lightbox || !lightboxContent) {
      console.warn('Lightbox not available to show content.');
      return;
    }
    collectMediaItems();
    if (mediaItems.length === 0) {
      console.warn('No media items found in grid.');
      return;
    }
    if (index < 0 || index >= mediaItems.length) {
      console.warn('Requested index out of range', index);
      return;
    }
    currentIndex = index;
    clearLightboxContent();

    const item = mediaItems[index];
    const media = resolveMediaForItem(item);

    // show the overlay early so percent/viewport-based max sizes can compute correctly
    lightbox.style.display = 'flex';

    if (!media || !media.type) {
      const p = document.createElement('div');
      p.style.color = '#fff';
      p.textContent = 'No preview available';
      lightboxContent.appendChild(p);
      return;
    }

    if (media.type === 'video') {
      if (!media.src) {
        // fallback: show poster image if present
        if (media.poster) {
          const img = document.createElement('img');
          img.src = media.poster;
          img.alt = item.getAttribute('aria-label') || '';
          img.style.maxWidth = '90vw';
          img.style.maxHeight = '80vh';
          img.style.width = 'auto';
          img.style.height = 'auto';
          // when poster image loads remove temporary min size
          img.onload = () => {
            lightboxContent.style.minWidth = '';
            lightboxContent.style.minHeight = '';
          };
          lightboxContent.appendChild(img);
          return;
        }
        console.warn('video tile has no data-video or data-video-high source', item);
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
      video.style.maxWidth = '90vw';
      video.style.maxHeight = '80vh';
      video.style.width = 'auto';
      video.style.height = 'auto';
      if (media.poster) video.setAttribute('poster', media.poster);

      const source = document.createElement('source');
      source.src = media.src;
      const ext = (media.src.split('?')[0].split('.').pop() || '').toLowerCase();
      if (ext === 'mp4') source.type = 'video/mp4';
      else if (ext === 'webm') source.type = 'video/webm';
      video.appendChild(source);

      // When metadata is loaded we can remove the temporary min size and try play
      video.onloadedmetadata = () => {
        lightboxContent.style.minWidth = '';
        lightboxContent.style.minHeight = '';
        // try to play if browser allows it
        video.play().catch(() => { /* autoplay blocked; user will press play */ });
      };

      // Some browsers won't fire onloadedmetadata until appended
      lightboxContent.appendChild(video);

      // If poster exists and video playback doesn't immediately provide size,
      // try to remove min size when poster image would be displayed:
      if (media.poster) {
        const posterImg = new Image();
        posterImg.src = media.poster;
        posterImg.onload = () => {
          lightboxContent.style.minWidth = '';
          lightboxContent.style.minHeight = '';
        };
      }

    } else { // image
      const hi = media.srcHigh;
      const low = media.srcLow;
      const img = document.createElement('img');
      img.alt = item.getAttribute('aria-label') || '';
      img.style.maxWidth = '90vw';
      img.style.maxHeight = '80vh';
      img.style.width = 'auto';
      img.style.height = 'auto';

      // choose hi if available else low
      img.src = hi || low || '';
      if (!img.src) {
        console.warn('image tile has no src to show', item);
        const p = document.createElement('div');
        p.style.color = '#fff';
        p.textContent = 'Image not available';
        lightboxContent.appendChild(p);
        return;
      }

      // remove temporary min size when image loads
      img.onload = () => {
        lightboxContent.style.minWidth = '';
        lightboxContent.style.minHeight = '';
      };

      // ensure we append after setting onload
      lightboxContent.appendChild(img);
    }
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
      collectMediaItems();
      if (mediaItems.length === 0) return;
      currentIndex = (currentIndex + 1) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
    if (e.key === "ArrowLeft") {
      collectMediaItems();
      if (mediaItems.length === 0) return;
      currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length;
      showLightboxByIndex(currentIndex);
    }
  }

  // Delegated click handler on the grid: handles clicks for current and future items
  grid.addEventListener('click', (evt) => {
    const tile = evt.target.closest && evt.target.closest('.grid-item');
    if (!tile || !grid.contains(tile)) return;
    // if click on a link let it through
    if (evt.target.closest && evt.target.closest('a')) return;

    collectMediaItems();
    const index = mediaItems.indexOf(tile);
    if (index === -1) {
      // clicked tile not considered a media tile: optionally ignore
      return;
    }
    showLightboxByIndex(index);
  });

  // Delegated global click handler for any .lightbox .close (covers existing and dynamically created close buttons)
  document.addEventListener('click', (e) => {
    const closeEl = e.target.closest && e.target.closest('.lightbox .close');
    if (closeEl) {
      e.preventDefault();
      e.stopPropagation();
      hideLightbox();
    }
  });

  // Re-apply layout after images load (ensures heights are correct)
  imagesLoaded(grid, () => {
    layoutGrid();
    // A second layout tick in case fonts/images/async content changed sizes
    requestAnimationFrame(() => layoutGrid());
    // ensure media list is collected for keyboard nav and initial open
    collectMediaItems();
  });

  // Relayout on resize (debounced)
  window.addEventListener('resize', debounce(() => {
    layoutGrid();
    collectMediaItems();
  }, 120));
});
