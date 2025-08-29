document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector('.grid');
  const sizer = document.querySelector('.grid-sizer');
  const gutter = 12; // must match CSS --gutter if you use that
  const minColumnWidth = 220; // adjust to control when columns collapse
  const maxColumns = 5; // highest column count
  let msnry = null;
  let lastCols = 0;

  if (!grid || !sizer) {
    console.warn('Grid or .grid-sizer not found. Masonry will not initialize.');
    return;
  }

  // Compute number of columns that fit the container
  function computeColumns(containerWidth) {
    // formula: floor((container + gutter) / (minCol + gutter))
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  // Compute column (sizer) width in px given container width and columns, accounting for gutters
  function computeSizerWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }

  // Set sizer width if changed and request Masonry layout
  function updateLayout() {
    const containerWidth = grid.clientWidth;
    const cols = computeColumns(containerWidth);
    const sizerWidth = computeSizerWidth(containerWidth, cols);

    // only update if something actually changed (prevents unnecessary layouts)
    if (cols !== lastCols || parseInt(sizer.style.width || '0', 10) !== sizerWidth) {
      sizer.style.width = sizerWidth + 'px';
      lastCols = cols;
      if (msnry) msnry.layout();
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
    // Set an initial sizer width before Masonry initializes
    updateLayout();

    msnry = new Masonry(grid, {
      itemSelector: '.grid-item',
      columnWidth: sizer,    // uses the element's width in px
      gutter: gutter,
      percentPosition: false // using pixel column width for reliability
    });

    // Ensure a final layout after masonry init
    msnry.layout();
  });

  // Recompute on window resize (debounced)
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
