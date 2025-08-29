// Wait for all images in .grid to finish loading (or error) before initializing FlexMasonry
(function initFlexMasonryWhenReady(selector) {
  const grids = Array.from(document.querySelectorAll(selector));
  if (!grids.length) return;

  const imgs = grids.flatMap(g => Array.from(g.querySelectorAll('img')));
  const promises = imgs.map(img => {
    return new Promise(resolve => {
      if (img.complete && img.naturalHeight !== 0) return resolve();
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  });

  Promise.all(promises).then(() => {
    // Initialize FlexMasonry with responsive breakpoints
    FlexMasonry.init(selector, {
      responsive: true,
      breakpointCols: {
        'min-width:1200px': 4,
        'min-width:900px': 3,
        'min-width:600px': 2,
        'min-width:0px': 1
      }
    });
  });
})('.grid');
