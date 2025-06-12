gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

window.addEventListener("load", () => {
  ScrollSmoother.create({
    wrapper: "#smooth-wrapper",
    content: "#smooth-content",
    smooth: 2,
    speed: 2,
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

gsap.set("h2", { opacity: 1 });

let splitt = SplitText.create("#title", { type: "chars" });
//now animate each character into place from 20px below, fading in:
gsap.from(splitt.chars, {
  y: 28,
  autoAlpha: 0,
  stagger: 0.05
});


