document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector('.grid');
  const sizer = document.querySelector('.grid-sizer');
  const gutter = 12; // px; keep in sync with CSS --gutter
  const minColumnWidth = 220; // minimum column width in px (tune to get desired density)
  const maxColumns = 5; // maximum columns allowed
  let msnry = null;
  let lastCols = 0;

  if (!grid || !sizer) {
    console.warn('Grid or .grid-sizer not found. Masonry will not initialize.');
    return;
  }

  // Compute how many columns fit in the container width
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  // Compute pixel width for the sizer given container width & columns (accounting for gutters)
  function computeSizerWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }

  // Make sure item span classes don't exceed available columns
  function clampItemSpans(cols) {
    const items = grid.querySelectorAll('.grid-item');
    items.forEach(item => {
      // prefer explicit data-col if provided by markup
      const dataCol = parseInt(item.getAttribute('data-col') || '', 10);
      let span = Number.isFinite(dataCol) ? dataCol : null;

      if (!span) {
        // If no explicit span, respect developer-assigned classes if any
        if (item.classList.contains('grid-item--w3')) span = 3;
        else if (item.classList.contains('grid-item--w2')) span = 2;
        else span = 1; // default
      }

      // make sure span is at least 1 and not more than cols
      span = Math.max(1, Math.min(span, cols));

      // normalize classes to reflect the final span
      item.classList.remove('grid-item--w2', 'grid-item--w3', 'grid-item--w4');
      if (span > 1) item.classList.add(`grid-item--w${span}`);
    });
  }

  // Optionally auto-assign spans for visual variety when markup doesn't specify them.
  // This tries to emulate a "tiler" look: a few double-wide tiles among singles.
  function autoAssignSpansIfMissing(cols) {
    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach((item, i) => {
      // skip if user already specified data-col or classes
      if (item.hasAttribute('data-col') || item.classList.contains('grid-item--w2') || item.classList.contains('grid-item--w3')) return;

      // Only consider multi-column spans at larger viewports
      if (cols >= 4) {
        // a simple deterministic-ish pattern to produce variety:
        // make roughly 1 in 6 items span 2, and 1 in 12 span 3
        const r = (i % 12);
        if (r === 2 || r === 8) item.classList.add('grid-item--w2');
        if (r === 0) item.classList.add('grid-item--w3');
      } else if (cols === 3) {
        // fewer wide tiles on smaller grids
        if ((i % 9) === 4) item.classList.add('grid-item--w2');
      }
    });

    // ensure no span exceeds available columns
    clampItemSpans(cols);
  }

  // Update sizer width, CSS variables, and trigger Masonry layout if necessary
  function updateLayout() {
    const containerWidth = grid.clientWidth;
    const cols = computeColumns(containerWidth);
    const sizerWidth = computeSizerWidth(containerWidth, cols);

    // update CSS variables used by the CSS rules (so width calculations in CSS work)
    grid.style.setProperty('--col', sizerWidth + 'px');
    grid.style.setProperty('--gutter', gutter + 'px');

    // Only reassign spans the first time or when columns count changes
    if (cols !== lastCols) {
      // auto-assign (if no explicit spans)
      autoAssignSpansIfMissing(cols);
      // ensure spans don't exceed new column count
      clampItemSpans(cols);
      lastCols = cols;
    }

    // Update the sizer element width (Masonry uses this element for column width)
    if (parseInt(sizer.style.width || '0', 10) !== sizerWidth) {
      sizer.style.width = sizerWidth + 'px';
      if (msnry) {
        msnry.layout();
      }
    }
  }

  // Debounce helper for resize
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  // Initialize Masonry after images loaded
  imagesLoaded(grid, () => {
    // initial layout calculation and variable setup
    updateLayout();

    msnry = new Masonry(grid, {
      itemSelector: '.grid-item',
      columnWidth: sizer, // element, px width set by JS
      gutter: gutter,
      percentPosition: false // we use pixel columnWidth for predictable gutters
    });

    // Ensure Masonry knows about current DOM sizes
    msnry.layout();
  });

  // Recompute on resize (debounced)
  window.addEventListener('resize', debounce(updateLayout, 120));

  /* -------------------------
     Lightbox (unchanged)
     ------------------------- */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const closeBtn = document.querySelector(".lightbox .close");
  const images = Array.from(document.querySelectorAll(".grid-item img"));
  let currentIndex = 0;

  function showLightbox(index){
    currentIndex = index;
    lightboxImg.src = images[index].src;
    lightbox.style.display = "flex";
  }

  function hideLightbox(){
    lightbox.style.display = "none";
    lightboxImg.src = "";
  }

  images.forEach((img,i)=>img.addEventListener("click",()=>showLightbox(i)));
  if (closeBtn) closeBtn.addEventListener("click",hideLightbox);
  if (lightbox) lightbox.addEventListener("click", e=>{ if(e.target===lightbox) hideLightbox(); });

  document.addEventListener("keydown", e=>{
    if(lightbox && lightbox.style.display==="flex"){
      if(e.key==="Escape") hideLightbox();
      if(e.key==="ArrowRight"){
        currentIndex = (currentIndex+1)%images.length;
        lightboxImg.src = images[currentIndex].src;
      }
      if(e.key==="ArrowLeft"){
        currentIndex = (currentIndex-1+images.length)%images.length;
        lightboxImg.src = images[currentIndex].src;
      }
    }
  });
});
