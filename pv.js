document.addEventListener("DOMContentLoaded", function(){
  const galleryItems = document.querySelectorAll(".media");
  const lightbox = document.getElementById("lightbox");
  const lbImage = document.getElementById("lb-image");
  const lbVideo = document.getElementById("lb-video");
  let currentIndex = 0;

  // Play video previews on hover
  galleryItems.forEach((item, index)=>{
    const type = item.dataset.type;
    if(type==="video"){
      const vid = item.querySelector("video");
      item.addEventListener("mouseenter", ()=> vid.play());
      item.addEventListener("mouseleave", ()=> vid.pause());
    }

    // Click to open lightbox
    item.addEventListener("click", ()=>{
      currentIndex = index;
      showLightbox();
    });
  });

  function showLightbox(){
    const item = galleryItems[currentIndex];
    const type = item.dataset.type;
    lightbox.classList.add("active");
    lbImage.style.display = "none";
    lbVideo.style.display = "none";

    if(type==="image"){
      lbImage.src = item.dataset.high;
      lbImage.style.display = "block";
    } else {
      lbVideo.src = item.dataset.high;
      lbVideo.style.display = "block";
      lbVideo.play();
    }
  }

  function hideLightbox(){
    lightbox.classList.remove("active");
    lbVideo.pause();
    lbVideo.src = "";
  }

  function next(){
    currentIndex = (currentIndex+1)%galleryItems.length;
    showLightbox();
  }

  function prev(){
    currentIndex = (currentIndex-1+galleryItems.length)%galleryItems.length;
    showLightbox();
  }

  // Lightbox controls
  lightbox.querySelector(".close").addEventListener("click", hideLightbox);
  lightbox.querySelector(".next").addEventListener("click", next);
  lightbox.querySelector(".prev").addEventListener("click", prev);

  // Keyboard navigation
  document.addEventListener("keydown", e=>{
    if(lightbox.classList.contains("active")){
      if(e.key==="ArrowRight") next();
      if(e.key==="ArrowLeft") prev();
      if(e.key==="Escape") hideLightbox();
    }
  });
});
