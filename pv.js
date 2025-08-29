// Init FlexMasonry
FlexMasonry.init('.gallery', {
  responsive: true,
  breakpoints: {
    350: { columns: 2 },
    768: { columns: 3 },
    1024: { columns: 4 },
    1400: { columns: 6 }
  }
});

// Lightbox
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const closeBtn = document.querySelector(".close");

document.querySelectorAll(".gallery img").forEach(img => {
  img.addEventListener("click", () => {
    lightbox.style.display = "block";
    lightboxImg.src = img.src;
  });
});

closeBtn.addEventListener("click", () => {
  lightbox.style.display = "none";
});

window.addEventListener("click", e => {
  if (e.target === lightbox) lightbox.style.display = "none";
});
