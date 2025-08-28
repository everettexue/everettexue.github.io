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

  function showLightbox(direction){
    const item = galleryItems[currentIndex];
    const type = item.dataset.type;
    const currentMedia = (type==="image") ? lbImage : lbVideo;

    lightbox.classList.add("active");
    lbImage.style.display = "none";
    lbVideo.style.display = "none";

    currentMedia.style.transition = "none";
    currentMedia.classList.remove("swipe-left","swipe-right","swipe-in");

    // Set starting position based on direction
    if(direction==="next") currentMedia.classList.add("swipe-right");
    else if(direction==="prev") currentMedia.classList.add("swipe-left");

    setTimeout(()=>{
      if(type==="image"){
        lbImage.src = item.dataset.high;
        lbImage.style.display = "block";
      } else {
        lbVideo.src = item.dataset.high;
        lbVideo.style.display = "block";
        lbVideo.play();
      }
      currentMedia.classList.add("swipe-in");
    },50);
  }

  function hideLightbox(){
    lightbox.classList.remove("active");
    lbVideo.pause();
    lbVideo.src = "";
  }

  function next(){
    const oldIndex = currentIndex;
    currentIndex = (currentIndex+1)%galleryItems.length;
    animateSwipe(oldIndex,"next");
  }

  function prev(){
    const oldIndex = currentIndex;
    currentIndex = (currentIndex-1+galleryItems.length)%galleryItems.length;
    animateSwipe(oldIndex,"prev");
  }

  function animateSwipe(oldIndex,direction){
    const oldItem = galleryItems[oldIndex];
    const oldType = oldItem.dataset.type;
    const oldMedia = (oldType==="image") ? lbImage : lbVideo;

    // Animate old media out
    oldMedia.classList.remove("swipe-in");
    oldMedia.classList.add(direction==="next" ? "swipe-left" : "swipe-right");

    // Show new media after animation
    setTimeout(()=> showLightbox(direction),500);
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
