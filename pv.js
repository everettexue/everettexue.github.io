document.addEventListener("DOMContentLoaded", function() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.querySelector(".lightbox-img");
  const closeBtn = document.querySelector(".lightbox-close");

  // open lightbox on image click
  document.querySelectorAll(".grid-item img").forEach(img => {
    img.addEventListener("click", () => {
      lightbox.style.display = "flex";
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || "";
    });
  });

  // close lightbox on close button
  closeBtn.addEventListener("click", () => {
    lightbox.style.display = "none";
    lightboxImg.src = "";
  });

  // close on clicking outside image
  lightbox.addEventListener("click", (e) => {
    if(e.target === lightbox) {
      lightbox.style.display = "none";
      lightboxImg.src = "";
    }
  });

  // close on ESC key
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") {
      lightbox.style.display = "none";
      lightboxImg.src = "";
    }
  });
});
