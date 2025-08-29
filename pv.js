// Initialize FlexMasonry
FlexMasonry.init('.gallery', {
  responsive: true,
  breakpointCols: {
    'min-width: 1500px': 5,
    'min-width: 1100px': 4,
    'min-width: 700px': 3,
    'min-width: 500px': 2,
    'min-width: 0px': 1
  }
});

// Lightbox functionality
const galleryItems = document.querySelectorAll('.gallery-item img, .gallery-item video');
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.querySelector('.lightbox-content');
const closeBtn = document.querySelector('.lightbox .close');
const prevBtn = document.querySelector('.lightbox .prev');
const nextBtn = document.querySelector('.lightbox .next');

let currentIndex = 0;

// Open lightbox
galleryItems.forEach((item, index) => {
  item.addEventListener('click', () => {
    currentIndex = index;
    showItem(item);
    lightbox.style.display = 'flex';
  });
});

function showItem(item) {
  lightboxContent.innerHTML = '';
  if (item.tagName === 'IMG') {
    const img = document.createElement('img');
    img.src = item.src;
    lightboxContent.appendChild(img);
  } else if (item.tagName === 'VIDEO') {
    const vid = document.createElement('video');
    vid.src = item.src;
    vid.controls = true;
    vid.autoplay = true;
    lightboxContent.appendChild(vid);
  }
}

// Navigation
function showIndex(idx) {
  if (idx < 0) idx = galleryItems.length - 1;
  if (idx >= galleryItems.length) idx = 0;
  currentIndex = idx;
  showItem(galleryItems[currentIndex]);
}

prevBtn.addEventListener('click', () => showIndex(currentIndex - 1));
nextBtn.addEventListener('click', () => showIndex(currentIndex + 1));
closeBtn.addEventListener('click', () => lightbox.style.display = 'none');

// Close on background click
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.style.display = 'none';
});
