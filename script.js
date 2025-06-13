gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

// Grid + physics constants
const grid = document.querySelector('.background-grid');
const spacing = 32;
const radius = 250;
const strength = 50;

window.addEventListener("load", () => {
  ScrollSmoother.create({
    wrapper: "#smooth-wrapper",
    content: "#smooth-content",
    smooth: 2,
    speed: 1.4,
    effects: true,
  });
});

// Split & animate h1
gsap.set("h1", { opacity: 1 });
let split = SplitText.create("#heading", { type: "chars" });
gsap.from(split.chars, {
  y: 56,
  autoAlpha: 0,
  stagger: 0.05
});

// Fade out h1 as it scrolls to top
gsap.to("#heading", {
  opacity: 0,
  ease: "none",
  scrollTrigger: {
    trigger: "#heading",
    start: "top 40%", // starts fading just before halfway up
    end: "top top",   // fully faded when it hits the top
    scrub: true
  }
});

// Split & animate h2 on scroll into view
gsap.set("h2", { opacity: 1 });
let splitt = SplitText.create("#title", { type: "chars" });
gsap.from(splitt.chars, {
  y: 28,
  autoAlpha: 0,
  stagger: 0.05,
  duration: 1,
  ease: "power2.out",
  scrollTrigger: {
    trigger: "#title",
    start: "top 90%",
    toggleActions: "play none none none"
  }
});

// Grid dot generation
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

// Dot hover movement
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

// Event listeners
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
