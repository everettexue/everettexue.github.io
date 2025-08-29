// pv.js
// - Waits for all images to load before first init
// - Wraps images in .card so gutter padding is visible
// - Re-initializes FlexMasonry on resize (debounced)

const SELECTOR = '.grid';
const DEBOUNCE_MS = 140;

// debounce helper
function debounce(fn, wait) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// wrap <img> with a .card if not already
function wrapImages(grid) {
  Array.from(grid.querySelectorAll('img')).forEach(img => {
    if (img.parentElement && img.parentElement.classList.contains('card')) return;
    const card = document.createElement('div');
    card.className = 'card';
    img.parentNode.insertBefore(card, img);
    card.appendChild(img);
  });
}

// initialize or re-initialize FlexMasonry
function initMasonry(selector) {
  const grids = Array.from(document.querySelectorAll(selector));
  if (!grids.length) return;

  // wrap images so padding becomes visible
  grids.forEach(wrapImages);

  // attempt to destroy prior instance if API exists
  if (typeof FlexMasonry !== 'undefined' && typeof FlexMasonry.destroy === 'function') {
    try {
      FlexMasonry.destroy(selector);
    } catch (e) {
      // ignore errors from destroy
    }
  }

  // initialize with responsive breakpoints
  FlexMasonry.init(selector, {
    responsive: true,
    breakpointCols: {
      'min-width:1400px': 5,
      'min-width:1200px': 4,
      'min-width:900px': 3,
      'min-width:600px': 2,
      'min-width:0px': 1
    }
  });
}

// wait for all images to be loaded (or errored) before first init
(function initial() {
  const grids = Array.from(document.querySelectorAll(SELECTOR));
  if (!grids.length) return;

  const imgs = grids.flatMap(g => Array.from(g.querySelectorAll('img')));
  const imgPromises = imgs.map(img => new Promise(resolve => {
    if (img.complete && img.naturalHeight !== 0) return resolve();
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  }));

  Promise.all(imgPromises).then(() => {
    initMasonry(SELECTOR);
  });
})();

// re-init on resize (debounced)
window.addEventListener('resize', debounce(() => initMasonry(SELECTOR), DEBOUNCE_MS));
