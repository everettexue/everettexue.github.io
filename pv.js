document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector('.grid');

  // Initialize Masonry after images load
  imagesLoaded(grid, () => {
    new Masonry(grid, {
      itemSelector: '.grid-item',
      columnWidth: '.grid-sizer',
      percentPosition: true,
      gutter: 12
    });
  });

  // Lightbox functionality
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

  images.forEach((img, i) => {
    img.addEventListener("click", () => showLightbox(i));
  });

  closeBtn.addEventListener("click", hideLightbox);
  lightbox.addEventListener("click", e => { if(e.target === lightbox) hideLightbox(); });

  // Keyboard navigation
  document.addEventListener("keydown", e => {
    if(lightbox.style.display === "flex"){
      if(e.key === "Escape") hideLightbox();
      if(e.key === "ArrowRight"){
        currentIndex = (currentIndex + 1) % images.length;
        lightboxImg.src = images[currentIndex].src;
      }
      if(e.key === "ArrowLeft"){
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        lightboxImg.src = images[currentIndex].src;
      }
    }
  });
});
