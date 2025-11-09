// Enhanced photo/video lightbox with category filtering and preload caching.
// - Adds a fly-out category panel (All default, highlights active selection).
// - Keeps thumbnails with matching categories in navigation order.
// - Reuses Image objects so navigating back/forth avoids fresh downloads.

(function () {
  'use strict';

  function initLightbox() {
    const wrapper = document.querySelector('.grid-wrapper');
    if (!wrapper) {
      console.warn('pv-lightbox: .grid-wrapper not found on this page — lightbox not initialized.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.innerHTML = `
      <div class="lb-content" role="dialog" aria-modal="true" aria-label="Image viewer">
        <button class="lb-btn lb-prev" aria-label="Previous image"><span aria-hidden="true">◀</span></button>
        <div class="lb-image-stage">
          <img class="lb-image lb-image-proxy" src="" alt="">
        </div>
        <button class="lb-btn lb-next" aria-label="Next image"><span aria-hidden="true">▶</span></button>
        <button class="lb-btn lb-close" aria-label="Close viewer"><span aria-hidden="true">✕</span><span class="sr-only">Close</span></button>
        <a class="lb-btn lb-download" aria-label="Download image" download><span aria-hidden="true">⬇</span></a>
        <div class="lb-caption" aria-hidden="true"></div>
        <div class="lb-hint" aria-hidden="true">← → to navigate · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);

  const stageEl = overlay.querySelector('.lb-image-stage');
  const proxyImg = stageEl.querySelector('.lb-image-proxy');
    const prevBtn = overlay.querySelector('.lb-prev');
    const nextBtn = overlay.querySelector('.lb-next');
    const closeBtn = overlay.querySelector('.lb-close');
    const downloadBtn = overlay.querySelector('.lb-download');
    const captionEl = overlay.querySelector('.lb-caption');

  stageEl.classList.add('is-loading');

    const tileSelector = '[data-categories]';
    const EDGE_OPEN_PX = 64;
    const EDGE_PEEK_PX = 240;
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

    let currentIndex = -1;
    let currentThumbs = [];
    const imageCache = new Map();

    let activeCategory = 'all';
    const categoryButtons = new Map();
    let categoryPanel = null;
    let categoryHint = null;
    let edgeHotspot = null;

    function normalizeCategory(name) {
      return (name || '').toString().trim().toLowerCase();
    }

    function formatCategoryLabel(name) {
      if (!name || name === 'all') return 'All';
      return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function isTileHidden(tile) {
      return tile && tile.classList.contains('is-filtered');
    }

    function resolveSrcFromThumb(thumb) {
      if (!thumb) return '';
      const anchor = thumb.closest('a');
      return thumb.dataset.full || (anchor && anchor.getAttribute('href')) || thumb.src || '';
    }

    function collectThumbs() {
      return Array.from(wrapper.querySelectorAll('img')).filter((img) => {
        const tile = img.closest(tileSelector);
        return !isTileHidden(tile);
      });
    }

    function isImageReady(img) {
      return !!(img && img.complete && img.naturalWidth > 0);
    }

    function getOrCreateImage(src) {
      if (!src) return null;
      let cached = imageCache.get(src);
      if (cached) return cached;

      const preloaded = new Image();
      preloaded.decoding = 'async';
      preloaded.loading = 'eager';
      preloaded.src = src;
      imageCache.set(src, preloaded);
      return preloaded;
    }

    function urlsMatch(a, b) {
      if (!a || !b) return a === b;
      try {
        const ua = new URL(a, location.href);
        const ub = new URL(b, location.href);
        return ua.href === ub.href;
      } catch (err) {
        return a === b;
      }
    }

    const adoptedPlacements = new WeakMap();
    let activeLightboxImg = null;

    // Return an adopted thumbnail back to its tile when we leave the viewer or switch images.
    function releaseActiveImage() {
      if (!activeLightboxImg) return;
      const placement = adoptedPlacements.get(activeLightboxImg);
      if (stageEl.contains(activeLightboxImg)) {
        stageEl.removeChild(activeLightboxImg);
      }
      if (placement) {
        const { marker, isFromGrid } = placement;
        activeLightboxImg.classList.remove('lb-image', 'lb-image-active');
        if (isFromGrid) {
          activeLightboxImg.removeAttribute('data-lb-adopted');
          if (marker && marker.parentNode) {
            marker.parentNode.replaceChild(activeLightboxImg, marker);
          } else {
            wrapper.appendChild(activeLightboxImg);
            if (marker) marker.remove();
          }
        } else if (marker) {
          marker.remove();
        }
        adoptedPlacements.delete(activeLightboxImg);
      }
      activeLightboxImg = null;
    }

    // Move the ready thumbnail into the stage so we reuse the already-downloaded pixels.
    function adoptThumbForDisplay(thumb) {
      if (!thumb) return null;
      if (thumb === activeLightboxImg) return thumb;

      releaseActiveImage();

      const parent = thumb.parentNode;
      if (!parent) return null;

      const marker = document.createComment('pv-thumb-marker');
      parent.insertBefore(marker, thumb);
    adoptedPlacements.set(thumb, { marker, isFromGrid: true });

      stageEl.appendChild(thumb);
      thumb.classList.add('lb-image', 'lb-image-active');
      thumb.dataset.lbAdopted = 'true';
      thumb.loading = 'eager';
      thumb.decoding = thumb.decoding || 'async';

      activeLightboxImg = thumb;
      stageEl.classList.remove('is-loading');
      proxyImg.hidden = true;
      proxyImg.dataset.activeSrc = '';
      return thumb;
    }

    function adoptCachedImage(image, altText) {
      if (!image) return null;
      if (image === activeLightboxImg) return image;

      releaseActiveImage();
      image.classList.add('lb-image', 'lb-image-active');
      if (altText) image.alt = altText;

      adoptedPlacements.set(image, { marker: null, isFromGrid: false });
      stageEl.appendChild(image);
      stageEl.classList.remove('is-loading');
      proxyImg.hidden = true;
      proxyImg.dataset.activeSrc = '';
      activeLightboxImg = image;
      return image;
    }

    function displayImageForThumb(thumb) {
      const resetProxy = () => {
        proxyImg.hidden = false;
        proxyImg.dataset.activeSrc = '';
        proxyImg.removeAttribute('src');
        stageEl.classList.add('is-loading');
      };

      if (!thumb) {
        releaseActiveImage();
        resetProxy();
        return;
      }

      const targetSrc = resolveSrcFromThumb(thumb);
      if (!targetSrc) {
        releaseActiveImage();
        resetProxy();
        return;
      }

      const rawSrc = thumb.getAttribute('src') || thumb.src || '';
      const altText = thumb.getAttribute('alt') || '';
      proxyImg.alt = altText;
      const sameResource = urlsMatch(targetSrc, rawSrc);

      if (sameResource && thumb.complete && thumb.naturalWidth > 0) {
        adoptThumbForDisplay(thumb);
        return;
      }

      function loadViaCache() {
        releaseActiveImage();
        proxyImg.hidden = false;
        stageEl.classList.add('is-loading');
        proxyImg.removeAttribute('src');

        const cached = getOrCreateImage(targetSrc);
        if (!cached) {
          proxyImg.dataset.activeSrc = '';
          stageEl.classList.remove('is-loading');
          return;
        }

        const displayIfCurrent = () => {
          if (!overlay.classList.contains('open')) return;
          if (currentThumbs[currentIndex] !== thumb) return;
          adoptCachedImage(cached, altText);
        };

        if (isImageReady(cached)) {
          displayIfCurrent();
          return;
        }

        proxyImg.dataset.activeSrc = targetSrc;

        cached.addEventListener('load', displayIfCurrent, { once: true });
        cached.addEventListener('error', () => {
          if (proxyImg.dataset.activeSrc !== targetSrc) return;
          proxyImg.src = targetSrc;
          proxyImg.hidden = false;
          stageEl.classList.remove('is-loading');
        }, { once: true });

        if (!cached.src) cached.src = targetSrc;
      }

      if (sameResource && !thumb.complete) {
        releaseActiveImage();
        stageEl.classList.add('is-loading');
        proxyImg.hidden = true;
        proxyImg.dataset.activeSrc = targetSrc;

        const handleReady = () => {
          if (!overlay.classList.contains('open')) return;
          if (currentThumbs[currentIndex] !== thumb) return;
          if (thumb.complete && thumb.naturalWidth > 0) {
            adoptThumbForDisplay(thumb);
          } else {
            loadViaCache();
          }
        };

        thumb.addEventListener('load', handleReady, { once: true });
        thumb.addEventListener('error', handleReady, { once: true });
        return;
      }

      loadViaCache();
    }

    function warmNeighbors(index) {
      const lookahead = 2;
      for (let offset = -lookahead; offset <= lookahead; offset += 1) {
        if (offset === 0) continue;
        const neighbor = currentThumbs[index + offset];
        if (!neighbor) continue;
        const neighborSrc = resolveSrcFromThumb(neighbor);
        if (!neighborSrc) continue;
        const rawSrc = neighbor.getAttribute('src') || neighbor.src || '';
        if (urlsMatch(neighborSrc, rawSrc)) {
          neighbor.loading = 'eager';
          neighbor.decoding = neighbor.decoding || 'async';
          continue;
        }
        const neighborImg = getOrCreateImage(neighborSrc);
        if (neighborImg && !isImageReady(neighborImg)) {
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

    function updateCategoryButtons() {
      categoryButtons.forEach((button, key) => {
        const isActive = key === activeCategory;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
      });
    }

    function applyCategory(category, options) {
      const opts = options || {};
      const normalized = normalizeCategory(category) || 'all';
      if (!opts.force && normalized === activeCategory) {
        hideCategoryPanel();
        return;
      }

      activeCategory = normalized;
      updateCategoryButtons();

      const tiles = Array.from(wrapper.querySelectorAll(tileSelector));
      tiles.forEach((tile) => {
        const raw = tile.dataset.categories || '';
        const categories = raw.split(/[\s,]+/).filter(Boolean).map(normalizeCategory);
        const shouldShow = normalized === 'all' || categories.includes(normalized);
        tile.classList.toggle('is-filtered', !shouldShow);
        if (shouldShow) {
          tile.removeAttribute('aria-hidden');
        } else {
          tile.setAttribute('aria-hidden', 'true');
        }
      });

      currentThumbs = collectThumbs();

      if (!opts.keepOverlay && overlay.classList.contains('open')) {
        closeOverlay();
      }

      if (!isCoarsePointer) hideCategoryPanel();
    }

    function showCategoryPanel() {
      if (!categoryPanel) return;
      categoryPanel.classList.add('is-visible');
      categoryPanel.classList.remove('is-peeking');
      if (categoryHint) categoryHint.classList.add('is-hidden');
    }

    function peekCategoryPanel() {
      if (!categoryPanel || categoryPanel.classList.contains('is-visible')) return;
      categoryPanel.classList.add('is-peeking');
      if (categoryHint) categoryHint.classList.remove('is-hidden');
    }

    function hideCategoryPanel() {
      if (!categoryPanel || isCoarsePointer) return;
      categoryPanel.classList.remove('is-visible');
      categoryPanel.classList.remove('is-peeking');
      if (categoryHint) categoryHint.classList.remove('is-hidden');
    }

    function isPointerOverNavbar(event) {
      const navbar = document.querySelector('.navbar');
      if (!navbar || !event) return false;
      const rect = navbar.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    }

    function initCategoryPanel() {
      const tiles = Array.from(wrapper.querySelectorAll(tileSelector));
      if (!tiles.length) return;
      if (document.querySelector('.pv-category-panel')) return;

      const counts = new Map();
      tiles.forEach((tile) => {
        const raw = tile.dataset.categories || '';
        const entries = raw.split(/[\s,]+/).filter(Boolean);
        if (!entries.length) {
          const key = 'uncategorized';
          tile.dataset.categories = key;
          counts.set(key, (counts.get(key) || 0) + 1);
          return;
        }
        entries.forEach((name) => {
          const key = normalizeCategory(name);
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      });

      const totalCount = tiles.length;

      categoryPanel = document.createElement('aside');
      categoryPanel.className = 'pv-category-panel';
      categoryPanel.id = 'pv-category-panel';
      categoryPanel.setAttribute('role', 'navigation');
      categoryPanel.setAttribute('aria-label', 'Gallery categories');
      categoryPanel.innerHTML = `
        <div class="pv-category-header">Categories</div>
        <ul class="pv-category-list" role="list"></ul>
      `;

      const listEl = categoryPanel.querySelector('.pv-category-list');
      categoryButtons.clear();

      function createCategoryButton(key, label, count, secondary) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pv-category-button';
        if (secondary) button.classList.add('is-secondary');
        button.dataset.category = key;
        button.innerHTML = `<span>${label}</span><span class="pv-category-count">${count}</span>`;
        if (key === activeCategory) button.classList.add('is-active');
        button.setAttribute('aria-pressed', String(key === activeCategory));
        button.addEventListener('click', () => applyCategory(key));
        li.appendChild(button);
        listEl.appendChild(li);
        categoryButtons.set(key, button);
      }

      createCategoryButton('all', 'All', totalCount, false);

      const keys = Array.from(counts.keys());
      const trailingKeys = ['other'];
      const sorted = keys
        .filter((key) => !trailingKeys.includes(key))
        .sort((a, b) => a.localeCompare(b));
      const tail = trailingKeys.filter((key) => keys.includes(key));
      [...sorted, ...tail].forEach((key) => {
        createCategoryButton(key, formatCategoryLabel(key), counts.get(key) || 0, false);
      });

      document.body.appendChild(categoryPanel);

      categoryHint = document.createElement('div');
      categoryHint.className = 'pv-category-hint';
      categoryHint.setAttribute('aria-hidden', 'true');
      categoryHint.innerHTML = '<span></span><span></span><span></span>';
      document.body.appendChild(categoryHint);

      edgeHotspot = document.createElement('div');
      edgeHotspot.className = 'pv-edge-hotspot';
      edgeHotspot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(edgeHotspot);

      edgeHotspot.addEventListener('mouseenter', () => {
        if (!isCoarsePointer) showCategoryPanel();
      });
      edgeHotspot.addEventListener('mouseleave', () => {
        if (!isCoarsePointer) hideCategoryPanel();
      });

      categoryPanel.addEventListener('mouseenter', showCategoryPanel);
      categoryPanel.addEventListener('mouseleave', () => {
        if (!isCoarsePointer) hideCategoryPanel();
      });
      categoryPanel.addEventListener('focusout', (event) => {
        if (!categoryPanel.contains(event.relatedTarget)) hideCategoryPanel();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && categoryPanel && categoryPanel.classList.contains('is-visible')) {
          hideCategoryPanel();
        }
      });

      if (isCoarsePointer) {
        showCategoryPanel();
      }
    }

    function setStateForIndex(index) {
      if (!currentThumbs.length) {
        currentThumbs = collectThumbs();
      }
      currentIndex = index;
      const thumb = currentThumbs[currentIndex];
      if (!thumb) return;
      const alt = thumb.getAttribute('alt') || '';
  proxyImg.alt = alt;
      displayImageForThumb(thumb);
      const src = resolveSrcFromThumb(thumb);
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
      stageEl.classList.add('is-loading');
      proxyImg.hidden = false;
      setStateForIndex(index);
      overlay.classList.add('open');
      closeBtn.focus();
      document.body.style.overflow = 'hidden';
    }

    function closeOverlay() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      setTimeout(() => {
        if (overlay.classList.contains('open')) return;
        releaseActiveImage();
        proxyImg.hidden = false;
        proxyImg.src = '';
        proxyImg.dataset.activeSrc = '';
        proxyImg.alt = '';
        stageEl.classList.add('is-loading');
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

    wrapper.addEventListener('click', (event) => {
      const clickedImg = event.target.closest('img');
      if (!clickedImg || !wrapper.contains(clickedImg)) return;
      const clickedAnchor = clickedImg.closest('a');
      if (clickedAnchor) {
        event.preventDefault();
      } else {
        event.preventDefault();
      }

      const thumbs = collectThumbs();
      const index = thumbs.indexOf(clickedImg);
      if (index === -1) {
        console.warn('pv-lightbox: clicked thumbnail not found in list.');
        return;
      }
      currentThumbs = thumbs;
      openAt(index);
    });

    prevBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      showPrev();
    });
    nextBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      showNext();
    });
    closeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeOverlay();
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeOverlay();
    });

    document.addEventListener('keydown', (event) => {
      if (!overlay.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNext();
      }
    });

    (function addSwipe() {
      let startX = 0;
      let startY = 0;
      let tracking = false;

      overlay.addEventListener('touchstart', (event) => {
        if (!overlay.classList.contains('open')) return;
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
      }, { passive: true });

      overlay.addEventListener('touchmove', (event) => {
        if (!tracking) return;
        const touch = event.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) > Math.abs(dy)) event.preventDefault();
      }, { passive: false });

      overlay.addEventListener('touchend', (event) => {
        if (!tracking) return;
        tracking = false;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - startX;
        if (Math.abs(dx) > 40) {
          if (dx > 0) showPrev();
          else showNext();
        }
      });
    })();

    initCategoryPanel();
    applyCategory(activeCategory, { force: true, keepOverlay: true });
    currentThumbs = collectThumbs();

    if (!isCoarsePointer) {
      document.addEventListener('mousemove', (event) => {
        if (!categoryPanel) return;
        if (overlay.classList.contains('open')) return;
        if (isPointerOverNavbar(event)) {
          hideCategoryPanel();
          return;
        }
        const x = event.clientX;
        if (x <= EDGE_OPEN_PX) {
          showCategoryPanel();
        } else if (x <= EDGE_PEEK_PX) {
          peekCategoryPanel();
        } else {
          hideCategoryPanel();
        }
      });
    }

    window.__pvLightbox = {
      openAt,
      close: closeOverlay,
      overlayElement: overlay
    };

    console.info('pv-lightbox: ready. Click a thumbnail to open the viewer.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox, { once: true });
  } else {
    initLightbox();
  }
})();
