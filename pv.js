// Initialize Masonry
document.addEventListener("DOMContentLoaded", function() {
  var grid = document.querySelector('.grid');
  var msnry = new Masonry(grid, {
    itemSelector: '.grid-item',
    columnWidth: '.grid-sizer',
    percentPosition: true,
    gutter: 12
  });

  // Lightbox
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.querySelector(".lightbox-img");
  const closeBtn = document.querySelector(".lightbox-close");

  document.querySelectorAll(".grid-item img").forEach(img => {
    img.addEventListener("click", () => {
      lightbox.style.display = "flex";
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || "";
    });
  });

  closeBtn.addEventListener("click", () => {
    lightbox.style.display = "none";
    lightboxImg.src = "";
  });

  lightbox.addEventListener("click", (e) => {
    if(e.target === lightbox){
      lightbox.style.display = "none";
      lightboxImg.src = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      lightbox.style.display = "none";
      lightboxImg.src = "";
    }
  });
});
