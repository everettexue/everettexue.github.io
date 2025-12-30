gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

const grid = document.querySelector('.background-grid');
const enableGridHover = grid && !document.body.classList.contains('no-grid-animate');
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
// now animate each character into place from 20px below, fading in:
gsap.from(split.chars, {
  y: 56,
  autoAlpha: 0,
  stagger: 0.05
});

// No SplitText animation on h2/title (was removed intentionally)

gsap.fromTo("#line-under-title",
  { width: "0%", opacity: 0 },
  {
    width: "90%", // You can tweak this width
    opacity: 1,
    duration: 1.1,
    ease: "power2.out",
    scrollTrigger: {
      trigger: "#title",
      start: "top 80%", // When h2 enters viewport
      toggleActions: "play none none none"
    }
  }
);






let dots = [];

function createGridDots() {
  const cols = Math.ceil(grid.clientWidth / spacing);
  const rows = 64;

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

if (grid) {
  createGridDots();

  if (enableGridHover) {
    grid.addEventListener('mousemove', handleMouseMove);
    grid.addEventListener('mouseleave', () => {
      dots.forEach(dot => dot.el.style.transform = 'translate(0, 0)');
    });
  }

  window.addEventListener('resize', () => {
    dots.forEach(dot => dot.el.remove());
    dots = [];
    createGridDots();
  });
}


window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.navbar');
  if (window.scrollY > 50) {
    navbar.classList.add('shrink');
  } else {
    navbar.classList.remove('shrink');
  }
});



// Animate the shine on hover/focus using GSAP (guard for missing button)
const btn = document.getElementById('shine-btn');
const gradient = document.getElementById('shine-gradient');
let shineTween;

function shine() {
  if (!btn || !gradient) return;
  if (shineTween) shineTween.kill();
  gradient.style.transform = 'translateX(-440px)';
  shineTween = gsap.to(gradient, {
    x: 440,
    duration: 0.7,
    ease: "power2.inOut",
    overwrite: true,
    onComplete: () => {
      gradient.style.transform = 'translateX(-440px)';
    }
  });
}

if (btn) {
  btn.addEventListener('mouseenter', shine);
  btn.addEventListener('focus', shine);
}
