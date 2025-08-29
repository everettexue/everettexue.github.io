// pv.js - Masonry init + imagesLoaded + responsive relayout
// - Wraps <img> in .card if not already
// - Waits for imagesLoaded before initial Masonry layout
// - Re-layout on window resize (debounced)

const GRID_SELECTOR = '.grid';
const DEBOUNCE_MS = 120;
let msnry = null;

// debounce helper
function debounce(fn, wait){ let t; return function(...a){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), wait); }; }

// wrap images into .card nodes so padding shows as gutter
function wrapImages() {
  const items = document.querySelectorAll('.grid-item');
  items.forEach(item => {
    if (item.querySelector('.card')) return;
    const img = item.querySelector('img');
    if (!img) return;
    const card = document.createElement('div');
    card.className = 'card';
    img.parentNode.insertBefore(card, img);
    card.appendChild(img);
    // make card focusable for keyboard users
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex','0');
  });
}

// initialize Masonry (or relayout)
function initMasonry() {
  const grid = document.querySelector(GRID_SELECTOR);
  if (!grid) return;

  // ensure images wrapped
  wrapImages();

  // if already inited, layout again
  if (msnry) {
    msnry.layout();
    return;
  }

  // Create Masonry instance with grid-sizer columnWidth and percentPosition true
  msnry = new Masonry(grid, {
    itemSelector: '.grid-item',
    columnWidth: '.grid-sizer',
    percentPosition: true,
    gutter: 0,            // gutter handled by padding in CSS
    horizontalOrder: true
  });
}

// initial setup: wait until images are loaded
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector(GRID_SELECTOR);
  if (!grid) return;

  // initialize imagesLoaded to ensure proper initial layout
  imagesLoaded(grid, () => {
    initMasonry();
  });
});

// relayout on resize (debounced)
window.addEventListener('resize', debounce(() => {
  if (msnry) msnry.layout();
}, DEBOUNCE_MS));
