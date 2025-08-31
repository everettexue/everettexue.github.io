// pv.js — Robust masonry/grid relayout using ResizeObserver + image normalization
// Fixes overlapping/incorrect-size tiles by:
// - forcing sensible grid CSS (display:grid, gap)
// - normalizing images to block, width:100% so heights are predictable
// - measuring each item's rendered height after images load and using ResizeObserver
//   to update grid-row spans dynamically when content changes (prevents overlap)
// - recalculating columns based on measured container width (getBoundingClientRect)
// - defensive fallbacks if ResizeObserver isn't available
//
// Drop this file in place of the previous pv.js and reload the page.

(function () {
  // --- Config ---
  const GUTTER = 12;           // px
  const MIN_COLUMN_WIDTH = 220; // px
  const MAX_COLUMNS = 5;
  const ROW_HEIGHT = 8;         // px (grid-auto-rows base unit)
  const RELAYOUT_DEBOUNCE = 80; // ms

  // --- Helpers ---
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // robust container width detection
  function getEffectiveContainerWidth(grid) {
    try {
      const rect = grid.getBoundingClientRect();
      if (rect && rect.width >= 50) return Math.round(rect.width);
      // fallback to first visible ancestor with width
      let a = grid.parentElement;
      while (a) {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        if (r && r.width >= 50 && cs.display !== 'none' && cs.visibility !== 'hidden') return Math.round(r.width);
        a = a.parentElement;
      }
      // last fallback to viewport
      return Math.round(window.innerWidth * 0.95);
    } catch (e) {
      return Math.round(window.innerWidth * 0.95);
    }
  }

  // compute columns & column width
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

  // --- Core: enforce grid styles and normalize children to avoid CSS conflicts ---
  function enforceGridStyles(grid) {
    grid.style.display = 'grid';
    grid.style.gridAutoFlow = 'row dense';
    grid.style.gap = `${GUTTER}px`;
    grid.style.gridAutoRows = `${ROW_HEIGHT}px`;

    // normalize each grid-item so external CSS doesn't force full-width or strange sizing
    Array.from(grid.querySelectorAll('.grid-item')).forEach(item => {
      item.style.boxSizing = item.style.boxSizing || 'border-box';
      item.style.width = item.style.width || 'auto';
      item.style.position = item.style.position || 'relative';
      item.style.removeProperty('min-width');
      item.style.removeProperty('max-width');
      // ensure card (content wrapper) doesn't collapse; if you use .card, prefer measuring it
      const card = item.querySelector('.card');
      if (card) {
        card.style.boxSizing = card.style.boxSizing || 'border-box';
      }
    });

    // normalize images inside grid so they size predictably
    Array.from(grid.querySelectorAll('img')).forEach(img => {
      // inline styles override rogue CSS rules (but keep existing inline if present)
      img.style.display = img.style.display || 'block';
      img.style.width = img.style.width || '100%';
      img.style.height = img.style.height || 'auto';
      img.style.objectFit = img.style.objectFit || 'cover';
      img.style.boxSizing = img.style.boxSizing || 'border-box';
    });
  }

  // --- Measure & set span for a single item ---
  function setItemRowSpan(grid, item) {
    if (!item) return;
    // prefer measuring the .card inside the item if present, otherwise the item itself
    const card = item.querySelector('.card') || item;
    // get rendered height
    const height = Math.ceil((card.getBoundingClientRect && card.getBoundingClientRect().height) || card.offsetHeight || 0);
    // row span calculation accounting for gutter
    const span = Math.max(1, Math.ceil((height + GUTTER) / (ROW_HEIGHT + GUTTER)));
    item.style.gridRowEnd = `span ${span}`;
  }

  // --- Relayout all items (recompute columns and rows) ---
  function relayoutAll(grid) {
    if (!grid) return;
    enforceGridStyles(grid);
    const containerWidth = getEffectiveContainerWidth(grid);
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    grid.style.gridAutoRows = `${ROW_HEIGHT}px`; // keep base row-height

    // update each item's span
    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach(item => {
      // ensure per-item inline styles won't force full-width (sometimes other scripts do)
      item.style.width = item.style.width || 'auto';
      item.style.boxSizing = item.style.boxSizing || 'border-box';
      setItemRowSpan(grid, item);
    });
  }

  // --- Observers & listeners to keep masonry stable when content changes ---
  function attachObservers(grid) {
    // Use ResizeObserver to update spans when item content changes (images load, fonts, etc.)
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(entries => {
        // batch changes using rAF to avoid thrashing
        window.requestAnimationFrame(() => {
          entries.forEach(entry => {
            // entry.target might be the observed element (we'll observe .card or item)
            const el = entry.target;
            const item = el.closest('.grid-item') || el;
            setItemRowSpan(grid, item);
          });
        });
      });
      // observe each .grid-item's content wrapper (prefer .card if present)
      Array.from(grid.querySelectorAll('.grid-item')).forEach(item => {
        const target = item.querySelector('.card') || item;
        try { ro.observe(target); } catch (e) { /* ignore if observe fails */ }
      });
    } else {
      // fallback: MutationObserver + image load listeners will trigger relayout
      const mo = new MutationObserver(debounce(() => relayoutAll(grid), RELAYOUT_DEBOUNCE));
      try { mo.observe(grid, { childList: true, subtree: true, attributes: true }); } catch (e) { /* ignore */ }
    }

    // ensure new items added later get observed: watch grid children
    const addObserver = new MutationObserver(mutations => {
      let added = false;
      mutations.forEach(m => {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList && node.classList.contains('grid-item')) {
            added = true;
            // normalize image and observe
            Array.from(node.querySelectorAll('img')).forEach(img => {
              img.style.display = img.style.display || 'block';
              img.style.width = img.style.width || '100%';
              img.style.height = img.style.height || 'auto';
              // attach onload to compute span after image loaded
              img.addEventListener('load', () => setItemRowSpan(grid, node));
            });
            const target = node.querySelector('.card') || node;
            if (ro) {
              try { ro.observe(target); } catch (e) { /* ignore */ }
            }
            // set initial span
            setItemRowSpan(grid, node);
          }
        });
      });
      if (added) {
        // columns might need recalculation if many items added
        relayoutAll(grid);
      }
    });
    try { addObserver.observe(grid, { childList: true, subtree: true }); } catch (e) { /* ignore */ }

    // When images load, update their parent item span
    Array.from(grid.querySelectorAll('img')).forEach(img => {
      img.addEventListener('load', () => {
        const item = img.closest('.grid-item');
        if (item) setItemRowSpan(grid, item);
      });
      img.addEventListener('error', () => {
        const item = img.closest('.grid-item');
        if (item) setItemRowSpan(grid, item);
      });
    });

    // on resize relayout everything (debounced)
    window.addEventListener('resize', debounce(() => relayoutAll(grid), RELAYOUT_DEBOUNCE));
  }

  // --- Initialization sequence ---
  function init() {
    const grid = document.querySelector('.grid');
    if (!grid) {
      console.warn('pv.js: .grid not found — nothing to initialize.');
      return;
    }

    // early enforcement so DevTools shows a proper grid even during preloader
    enforceGridStyles(grid);
    // wire observers and listeners
    attachObservers(grid);

    // initial relayout after next paint — ensures images have had a tick to load attributes
    requestAnimationFrame(() => {
      // run twice to be resilient against late image/ font layout
      relayoutAll(grid);
      requestAnimationFrame(() => {
        relayoutAll(grid);
      });
    });

    // Extra safety: if images are already loading, on window 'load' do a final relayout
    window.addEventListener('load', () => {
      setTimeout(() => relayoutAll(grid), 40);
      setTimeout(() => relayoutAll(grid), 300);
    });

    // expose for debugging
    window._pv_rel = () => relayoutAll(grid);
  }

  // run init now
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
