document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector('.grid');
  const gutter = 12;           // px — keep in sync with CSS --gutter
  const minColumnWidth = 220;  // px — controls when columns collapse
  const maxColumns = 5;        // maximum columns
  const rowHeight = 8;         // px — base row unit; keep in sync with CSS --row-height

  if (!grid) {
    console.warn('No .grid element found — tiler will not initialize.');
    return;
  }

  // debounce helper
  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  // Compute how many columns fit the container width
  function computeColumns(containerWidth) {
    const cols = Math.floor((containerWidth + gutter) / (minColumnWidth + gutter));
    return Math.max(1, Math.min(cols, maxColumns));
  }

  // Compute pixel width for each column (accounting for gutters)
  function computeColumnWidth(containerWidth, cols) {
    if (cols <= 1) return containerWidth;
    const totalGutters = (cols - 1) * gutter;
    return Math.floor((containerWidth - totalGutters) / cols);
  }

  // Determine desired column-span for an item (from data attribute or classes)
  function getRequestedColSpan(item) {
    const dataCol = parseInt(item.getAttribute('data-col'), 10);
    if (Number.isFinite(dataCol) && dataCol > 0) return dataCol;
    if (item.classList.contains('grid-item--w4')) return 4;
    if (item.classList.contains('grid-item--w3')) return 3;
    if (item.classList.contains('grid-item--w2')) return 2;
    return 1;
  }

  // Measure card height and compute rowSpan
  function computeRowSpan(item, rowHeightPx, gapPx) {
    const card = item.querySelector('.card') || item;
    // Use getBoundingClientRect for sub-pixel accuracy
    const contentHeight = Math.ceil(card.getBoundingClientRect().height);
    // row span formula: ceil( (height + gap) / (rowHeight + gap) )
    return Math.max(1, Math.ceil((contentHeight + gapPx) / (rowHeightPx + gapPx)));
  }

  // Main layout function: sets grid columns, auto-rows and computes spans for items
  function layoutGrid() {
    const containerWidth = grid.clientWidth;
    const cols = computeColumns(containerWidth);
    const colWidth = computeColumnWidth(containerWidth, cols);

    // apply grid template columns and auto-rows (pixel-controlled)
    grid.style.gridTemplateColumns = `repeat(${cols}, ${colWidth}px)`;
    grid.style.gridAutoRows = `${rowHeight}px`;
    grid.style.setProperty('--gutter', `${gutter}px`);
    grid.style.setProperty('--row-height', `${rowHeight}px`);

    // place items: set grid-column span and grid-row span
    const items = Array.from(grid.querySelectorAll('.grid-item'));
    items.forEach(item => {
      // requested column span (clamped)
      let span = getRequestedColSpan(item);
      span = Math.max(1, Math.min(span, cols));
      item.style.gridColumn = `span ${span}`;

      // compute and apply row span based on item content height
      const rowSpan = computeRowSpan(item, rowHeight, gutter);
      item.style.gridRowEnd = `span ${rowSpan}`;
    });
  }

  // Re-apply layout after images load (ensures heights are correct)
  imagesLoaded(grid, () => {
    layoutGrid();
    // A second layout tick in case fonts/images/async content changed sizes
    requestAnimationFrame(() => layoutGrid());
  });

  // Relayout on resize (debounced)
  window.addEventListener('resize', debounce(() => {
    layoutGrid();
  }, 120));

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
