// Improved lightbox script — robust against timing, anchors, and dynamic content.
// Usage: include on pages that use .grid-wrapper with thumbnail <img> elements.
// Clicking a thumbnail opens the lightbox. Prev/Next, Download and Close are supported.

(function () {
  'use strict';

  function initLightbox() {
    const wrapper = document.querySelector('.grid-wrapper');
    if (!wrapper) {
      console.warn('pv-lightbox: .grid-wrapper not found on this page — lightbox not initialized.');
      return;
    }

    // collect images (we will compute the list on each open to handle dynamic content)
    function collectThumbs() {
      return Array.from(wrapper.querySelectorAll('img'));
    }

    // Build overlay DOM once
    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
      <div class="lb-content" role="dialog" aria-modal="true" aria-label="Image viewer">
        <button class="lb-btn lb-prev" aria-label="Previous image"><span aria-hidden="true">◀</span></button>
        <img class="lb-image" src="" alt="">
        <button class="lb-btn lb-next" aria-label="Next image"><span aria-hidden="true">▶</span></button>
        <button class="lb-btn lb-close" aria-label="Close viewer"><span aria-hidden="true">✕</span><span class="sr-only">Close</span></button>
        <a class="lb-btn lb-download" aria-label="Download image" download><span aria-hidden="true">⬇</span></a>
        <div class="lb-caption" aria-hidden="true"></div>
        <div class="lb-hint" aria-hidden="true">← → to navigate · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('.lb-image');
    const prevBtn = overlay.querySelector('.lb-prev');
    const nextBtn = overlay.querySelector('.lb-next');
    const closeBtn = overlay.querySelector('.lb-close');
    const downloadBtn = overlay.querySelector('.lb-download');
    const captionEl = overlay.querySelector('.lb-caption');

    let currentIndex = -1;
    let currentThumbs = [];
    const imageCache = new Map();

    function resolveSrcFromThumb(thumb) {
      if (!thumb) return '';
      const anchor = thumb.closest('a');
      return thumb.dataset.full || (anchor && anchor.getAttribute('href')) || thumb.src || '';
    }

    function getOrCreateImage(src) {
      if (!src) return null;
      let cached = imageCache.get(src);
      if (!cached) {
        cached = new Image();
        cached.src = src;
        imageCache.set(src, cached);
      }
      return cached;
    }

    function displayImage(src) {
      const cached = getOrCreateImage(src);
      if (!cached) {
        imgEl.removeAttribute('src');
        return;
      }

      imgEl.dataset.activeSrc = src;

      if (cached.complete) {
        imgEl.src = cached.currentSrc || cached.src;
      } else {
        cached.addEventListener('load', () => {
          if (imgEl.dataset.activeSrc === src) {
            imgEl.src = cached.currentSrc || cached.src;
          }
        }, { once: true });
        // ensure load kicks off even if we captured late
        imgEl.src = cached.src;
      }
    }

    function warmNeighbors(index) {
      const lookahead = 2;
      for (let offset = -lookahead; offset <= lookahead; offset += 1) {
        if (offset === 0) continue;
        const neighbor = currentThumbs[index + offset];
        if (!neighbor) continue;
        const neighborSrc = resolveSrcFromThumb(neighbor);
        const neighborImg = getOrCreateImage(neighborSrc);
        if (neighborImg && !neighborImg.complete) {
          // attach a no-op load listener so the request stays warm
          neighborImg.addEventListener('load', () => {}, { once: true });
        }
      }
    }

    function deriveFileName(url) {
      try {
        const u = new URL(url, location.href);
        const p = u.pathname.split('/').pop();
        return p || 'image';
      } catch (e) {
        return 'image';
      }
    }

    function setStateForIndex(index) {
      if (!currentThumbs.length) {
        currentThumbs = collectThumbs();
      }
      currentIndex = index;
      const thumb = currentThumbs[currentIndex];
      if (!thumb) return;
      const src = resolveSrcFromThumb(thumb);
      const alt = thumb.getAttribute('alt') || '';
      displayImage(src);
      imgEl.alt = alt;
      captionEl.textContent = alt;
      downloadBtn.href = src;
      downloadBtn.setAttribute('download', deriveFileName(src));
      prevBtn.classList.toggle('disabled', currentIndex <= 0);
      nextBtn.classList.toggle('disabled', currentIndex >= currentThumbs.length - 1);
      warmNeighbors(currentIndex);
    }

    function openAt(index) {
      currentThumbs = collectThumbs();
      if (!currentThumbs.length) {
        console.warn('pv-lightbox: no thumbnails found.');
        return;
      }
      if (index < 0) index = 0;
      if (index >= currentThumbs.length) index = currentThumbs.length - 1;
      setStateForIndex(index);
      overlay.classList.add('open');
      // small accessibility: announce with aria-hidden toggles if needed (simple approach)
      // focus management: focus the close button
      closeBtn.focus();
      document.body.style.overflow = 'hidden';
      // aria-hidden on other content could be set here if desired
    }

    function closeOverlay() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      // clear src after animation for memory
      setTimeout(() => {
        imgEl.src = '';
        imgEl.dataset.activeSrc = '';
      }, 300);
    }

    function showPrev() {
      if (!currentThumbs.length) currentThumbs = collectThumbs();
      if (currentIndex > 0) setStateForIndex(currentIndex - 1);
    }
    function showNext() {
      if (!currentThumbs.length) currentThumbs = collectThumbs();
      if (currentIndex < currentThumbs.length - 1) setStateForIndex(currentIndex + 1);
    }

    // Delegated click handler on the wrapper so anchors and new images are handled.
    wrapper.addEventListener('click', (e) => {
      const clickedImg = e.target.closest('img');
      if (!clickedImg || !wrapper.contains(clickedImg)) return;
      // if image is inside an anchor, prevent navigation
      const clickedAnchor = clickedImg.closest('a');
      if (clickedAnchor) {
        e.preventDefault();
      } else {
        // if it's not in an anchor but image itself might be clickable, still prevent default
        e.preventDefault();
      }

      // get the up-to-date thumbs array and index
      const thumbs = collectThumbs();
      const index = thumbs.indexOf(clickedImg);
      if (index === -1) {
        console.warn('pv-lightbox: clicked thumbnail not found in list.');
        return;
      }
      currentThumbs = thumbs;
      openAt(index);
    });

    // Controls
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeOverlay(); });
    downloadBtn.addEventListener('click', (e) => {
      // download may be blocked for cross-origin images by browser; no special handling here
      // allow default behaviour
    });

    // click outside image closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    // keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeOverlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      }
    });

    // basic swipe for touch devices
    (function addSwipe() {
      let startX = 0;
      let startY = 0;
      let tracking = false;

      overlay.addEventListener('touchstart', (e) => {
        if (!overlay.classList.contains('open')) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      }, { passive: true });

      overlay.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        // if mostly horizontal, prevent scroll to allow swipe
        if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      }, { passive: false });

      overlay.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        if (Math.abs(dx) > 40) {
          if (dx > 0) showPrev(); else showNext();
        }
      });
    })();

    // expose for debugging (optional)
    window.__pvLightbox = {
      openAt: openAt,
      close: closeOverlay,
      overlayElement: overlay
    };

    console.info('pv-lightbox: initialized. Click a thumbnail inside .grid-wrapper to open the viewer.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
  } else {
    initLightbox();
  }
})();
