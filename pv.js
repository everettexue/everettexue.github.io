// Simple lightbox script to pair with pv.css
// Usage: include this script on pages that use .grid-wrapper with <img> thumbnails.
// Clicking a thumbnail opens the lightbox. Prev/Next, Download and Close are supported.
// Note: This is a small vanilla implementation, no dependencies.

(function () {
  const images = Array.from(document.querySelectorAll('.grid-wrapper img'));
  if (!images.length) return;

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

  // open lightbox at index
  function openAt(index) {
    if (index < 0 || index >= images.length) return;
    currentIndex = index;
    const thumb = images[currentIndex];
    const src = thumb.dataset.full || thumb.src; // prefer data-full if provided
    const alt = thumb.alt || '';
    imgEl.src = src;
    imgEl.alt = alt;
    captionEl.textContent = alt;
    downloadBtn.href = src;
    downloadBtn.setAttribute('download', deriveFileName(src));
    overlay.classList.add('open');
    // update prev/next disabled state
    prevBtn.classList.toggle('disabled', currentIndex === 0);
    nextBtn.classList.toggle('disabled', currentIndex === images.length - 1);
    // trap focus to close button for simplicity
    closeBtn.focus();
    document.body.style.overflow = 'hidden';
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

  function closeOverlay() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    // small delay to clear src for smooth transition
    setTimeout(() => { imgEl.src = ''; }, 300);
  }

  function showPrev() { if (currentIndex > 0) openAt(currentIndex - 1); }
  function showNext() { if (currentIndex < images.length - 1) openAt(currentIndex + 1); }

  // attach click handlers to thumbnails
  images.forEach((img, i) => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openAt(i);
    });
    // allow Enter key on focused thumbnails
    img.tabIndex = img.tabIndex || 0;
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAt(i);
      }
    });
  });

  // control handlers
  prevBtn.addEventListener('click', showPrev);
  nextBtn.addEventListener('click', showNext);
  closeBtn.addEventListener('click', closeOverlay);
  downloadBtn.addEventListener('click', (e) => {
    // allow normal download
  });

  // click outside image closes
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  // keyboard nav
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeOverlay();
    else if (e.key === 'ArrowLeft') showPrev();
    else if (e.key === 'ArrowRight') showNext();
  });

  // basic swipe support for touch devices
  (function addSwipe() {
    let startX = null;
    let startY = null;
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
      // prevent scroll on short horizontal swipes
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
      if (Math.abs(dx) > 40) {
        if (dx > 0) showPrev(); else showNext();
      }
    });
  })();

})();
