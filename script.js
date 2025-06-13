gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

const grid = document.querySelector('.background-grid');
const spacing = 32; // space between dots
const radius = 250; // effect radius
const strength = 50; // max repulsion distance


window.addEventListener("load", () => {
  ScrollSmoother.create({
    wrapper: "#smooth-wrapper",
    content: "#smooth-content",
    smooth: 2,
    speed: 1.4,
    effects: true,
  });
});

gsap.set("h1", { opacity: 1 });

let split = SplitText.create("#heading", { type: "chars" });
//now animate each character into place from 20px below, fading in:
gsap.from(split.chars, {
  y: 56,
  autoAlpha: 0,
  stagger: 0.05
});

// Set initial opacity (if not already in CSS)
gsap.set("h2", { opacity: 1 });

// Split the text into characters
let splitt = SplitText.create("#title", { type: "chars" });

// Animate when it enters the viewport
gsap.from(splitt.chars, {
  y: 28,
  autoAlpha: 0,
  stagger: 0.05,
  duration: 1,
  ease: "power2.out",
  scrollTrigger: {
    trigger: "#title",
    start: "top 90%",  // when top of h2 is 80% down the viewport
    toggleActions: "play none none none" // play once
  }
});

gsap.fromTo("#line-under-title",
  { width: "0%", opacity: 0 },
  {
    width: "175%", // You can tweak this width
    opacity: 1,
    duration: 0.8,
    ease: "power2.out",
    scrollTrigger: {
      trigger: "#title",
      start: "top 90%", // When h2 enters viewport
      toggleActions: "play none none none"
    }
  }
);







let dots = [];

function createGridDots() {
  const cols = Math.ceil(grid.clientWidth / spacing);
  const rows = Math.ceil(grid.clientHeight / spacing);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dot = document.createElement('div');
      dot.classList.add('dot');
      dot.style.left = `${x * spacing}px`;
      dot.style.top = `${y * spacing}px`;
      grid.appendChild(dot);
      dots.push({ el: dot, x: x * spacing, y: y * spacing });
    }
  }
}

function handleMouseMove(e) {
  const rect = grid.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  dots.forEach(dot => {
    const dx = mouseX - dot.x;
    const dy = mouseY - dot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius) {
      const angle = Math.atan2(dy, dx);
      const offset = (1 - dist / radius) * strength;
      const tx = -Math.cos(angle) * offset;
      const ty = -Math.sin(angle) * offset;
      dot.el.style.transform = `translate(${tx}px, ${ty}px)`;
    } else {
      dot.el.style.transform = `translate(0, 0)`;
    }
  });
}

grid.addEventListener('mousemove', handleMouseMove);
grid.addEventListener('mouseleave', () => {
  dots.forEach(dot => dot.el.style.transform = 'translate(0, 0)');
});






createGridDots();

window.addEventListener('resize', () => {
  dots.forEach(dot => dot.el.remove());
  dots = [];
  createGridDots();
});




