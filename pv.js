// pv.js — Squarespace-like behavior
// - Waits for images to load before first init
// - Wraps images in .card with overlay/caption (uses alt text)
// - Re-initializes FlexMasonry on resize (debounced)

const SELECTOR = '.grid';
const DEBOUNCE_MS = 140;

// simple debounce
function debounce(fn, wait) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// wrap <img> with a .card and add overlay with caption (from alt)
function wrapImages(grid) {
  Array.from(grid.querySelectorAll('img')).forEach(img => {
    // already wrapped?
    if (img.parentElement && img.parentElement.classList.contains('card')) return;

    const card = document.createElement('div');
    card.className = 'card';

    // overlay (caption) — uses alt text if present
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = img.alt || ''; // empty string if no alt

    overlay.appendChild(caption);

    // insert card and move img inside it, then append overlay
    img.parentNode.insertBefore(card, img);
    card.appendChild(img);
    card.appendChild(overlay);

    // make the card keyboard-focusable for accessibility
    // if the image isn't already focusable, add tabindex so :focus-within styles work
    if (!card.hasAttribute('tabindex')) {
      card.setAttribute('tabindex', '0');
    }
  });
}

// initialize or reinitialize FlexMasonry
function initMasonry(selector) {
  const grids = Array.from(document.querySelectorAll(selector));
  if (!grids.length) return;

  // ensure images are wrapped with .card
  grids.forEach(wrapImages);

  // attempt to destroy prior instance if API exists
  if (typeof FlexMasonry !== 'undefined' && typeof FlexMasonry.destroy === 'function') {
    try { FlexMasonry.destroy(selector); } catch (e) { /* ignore */ }
  }

  // initialize with breakpoints tuned for a Squarespace-like feel
  FlexMasonry.init(selector, {
    responsive: true,
    breakpointCols: {
      'min-width:1600px': 5,
      'min-width:1200px': 4,
      'min-width:900px': 3,
      'min-width:600px': 2,
      'min-width:0px': 1
    }
  });
}

// wait for all images to load (or error) before first init
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
