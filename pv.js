document.addEventListener("DOMContentLoaded", function() {
  const lazyImages = document.querySelectorAll("img.lazy");
  const lazyVideos = document.querySelectorAll("video source");

  // Lazy load images
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.onload = () => img.classList.remove("lazy");
          observer.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  } else {
    lazyImages.forEach(img => img.src = img.dataset.src);
  }

  // Lazy load videos
  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const source = entry.target;
          source.src = source.dataset.src;
          source.parentElement.load();
          observer.unobserve(source);
        }
      });
    });

    lazyVideos.forEach(source => videoObserver.observe(source));
  } else {
    lazyVideos.forEach(source => {
      source.src = source.dataset.src;
      source.parentElement.load();
    });
  }
});
