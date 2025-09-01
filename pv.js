// Lightbox script with a loading screen and skip button
// Reverts behavior to use thumbnails as before and shows a loading overlay while the viewer loads the image.

(function () {
  'use strict';

  function initLightbox() {
    const wrapper = document.querySelector('.grid-wrapper');
    if (!wrapper) {
      console.warn('pv-lightbox: .grid-wrapper not found on this page — lightbox not initialized.');
      return;
    }

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
        <div class="lb-loading" aria-hidden="true" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);">
          <div class="lb-loading-text" style="color:#fff;font-size:14px;">Loading…</div>
          <button class="lb-btn lb-skip" aria-label="Skip loading" type="button" style="width:auto;padding:8px 12px;border-radius:6px;">Skip</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const imgEl = overlay.querySelector('.lb-image');
    const prevBtn = overlay.querySelector('.lb-prev');
    const nextBtn = overlay.querySelector('.lb-next');
    const closeBtn = overlay.querySelector('.lb-close');
    const downloadBtn = overlay.querySelector('.lb-download');
    const captionEl = overlay.querySelector('.lb-caption');
    const loadingContainer = overlay.querySelector('.lb-loading');
    const skipBtn = overlay.querySelector('.lb-skip');

    let currentIndex = -1;
    let loading = false;
    let currentLoadAbortToken = 0;

    function deriveFileName(url) {
      try {
        const u = new URL(url, location.href);
        const p = u.pathname.split('/').pop();
        return p || 'image';
      } catch (e) {
        return 'image';
      }
    }

    // Show loading overlay
    function showLoading() {
      loading = true;
      loadingContainer.style.display = 'flex';
      loadingContainer.setAttribute('aria-hidden', 'false');
      imgEl.style.visibility = 'hidden';
    }

    function hideLoading() {
      loading = false;
      loadingContainer.style.display = 'none';
      loadingContainer.setAttribute('aria-hidden', 'true');
      imgEl.style.visibility = 'visible';
    }

    function setStateForIndex(index, thumbs) {
      currentIndex = index;
      const thumb = thumbs[currentIndex];
      if (!thumb) return;
      const anchor = thumb.closest('a');
      // revert to previous behavior: prefer data-full, then anchor href, then img.src
      const src = thumb.dataset.full || (anchor && anchor.getAttribute('href')) || thumb.src || '';
      const alt = thumb.getAttribute('alt') || '';
      captionEl.textContent = alt;
      downloadBtn.href = src;
      downloadBtn.setAttribute('download', deriveFileName(src));
      prevBtn.classList.toggle('disabled', currentIndex <= 0);
      nextBtn.classList.toggle('disabled', currentIndex >= thumbs.length - 1);

      // start loading flow with explicit handlers and loading screen
      currentLoadAbortToken += 1;
      const myToken = currentLoadAbortToken;

      // Remove previous handlers to avoid duplicates
      imgEl.onload = null;
      imgEl.onerror = null;

      // Show loading overlay
      showLoading();

      // assign handlers
      imgEl.onload = function () {
        // ignore if a newer load started
        if (myToken !== currentLoadAbortToken) return;
        hideLoading();
      };

      imgEl.onerror = function () {
        if (myToken !== currentLoadAbortToken) return;
        // hide loading but keep image visible (it may show broken image); optionally set caption
        hideLoading();
        captionEl.textContent = alt ? alt + ' (failed to load)' : 'Failed to load image';
        console.warn('pv-lightbox: failed to load', imgEl.src);
      };

      // set src (this triggers load)
      imgEl.src = src;
      imgEl.alt = alt;
    }

    function openAt(index) {
      const thumbs = collectThumbs();
      if (!thumbs.length) {
        console.warn('pv-lightbox: no thumbnails found.');
        return;
      }
      if (index < 0) index = 0;
      if (index >= thumbs.length) index = thumbs.length - 1;
      setStateForIndex(index, thumbs);
      overlay.classList.add('open');
      closeBtn.focus();
      document.body.style.overflow = 'hidden';
    }

    function closeOverlay() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      // abort any pending load state
      currentLoadAbortToken += 1;
      // small delay to clear src for smooth transition
      setTimeout(() => { imgEl.src = ''; }, 300);
    }

    function showPrev() { if (currentIndex > 0) setStateForIndex(currentIndex - 1, collectThumbs()); }
    function showNext() { if (currentIndex < collectThumbs().length - 1) setStateForIndex(currentIndex + 1, collectThumbs()); }

    // Delegated click handler on the wrapper so anchors and new images are handled.
    wrapper.addEventListener('click', (e) => {
      const clickedImg = e.target.closest('img');
      if (!clickedImg || !wrapper.contains(clickedImg)) return;
      const clickedAnchor = clickedImg.closest('a');
      if (clickedAnchor) e.preventDefault();
      else e.preventDefault();

      const thumbs = collectThumbs();
      const index = thumbs.indexOf(clickedImg);
      if (index === -1) {
        console.warn('pv-lightbox: clicked thumbnail not found in list.');
        return;
      }
      openAt(index);
    });

    // Controls
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeOverlay(); });
    downloadBtn.addEventListener('click', (e) => { /* allow default behavior */ });

    // Skip button hides the loading screen and reveals the image immediately
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // hide the loading overlay even if the image hasn't finished loading
      hideLoading();
    });

    // click outside image closes
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    // keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showNext(); }
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
        if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
      }, { passive: false });

      overlay.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        if (Math.abs(dx) > 40) { if (dx > 0) showPrev(); else showNext(); }
      });
    })();

    // expose for debugging (optional)
    window.__pvLightbox = {
      openAt: openAt,
      close: closeOverlay,
      overlayElement: overlay
    };

    console.info('pv-lightbox: initialized with loading screen and skip button.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
  } else {
    initLightbox();
  }
})();
