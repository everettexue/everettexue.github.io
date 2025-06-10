gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

const smoother = ScrollSmoother.create({
  smooth: 2,
  speed: 2,
  effects: true,
 // normalizeScroll: true,
  smoothTouch: 0.1,
});

let paths = gsap.utils.toArray("#logo-scroll path, #logo-smoother path, #logo-mouse");
let byGreensock = document.querySelector("#by-greensock");

let distPaths = gsap.utils.distribute({
  base: -300,
  amount: 600,
});

let logoTl = gsap.timeline({
  scrollTrigger: {
    trigger: ".logo-section",
    scrub: 1,
    start: "bottom 95%",
    end: "bottom center"
  }
});

logoTl.to(paths, { x: distPaths })
  .to([...paths, byGreensock], { opacity: 0 }, 0)

let gridTl = gsap.timeline({
  scrollTrigger: {
    trigger: ".grid-section",
    scrub: 1,
    start: "top center",
    end: "bottom+=10% bottom",
  },
  defaults: {
    ease: "power1.inOut"
  }
});

gridTl.add("start")
  .from(".grid-layout", {
    ease: "power1",
    scale: 3
  }, "start")
  .from(".column-1 .grid-image", {
    duration: 0.6,
    xPercent: i => -((i + 1) * 40 + i * 100),
    yPercent: i => (i + 1) * 40 + i * 100
  }, "start")
  .from(".column-3 .grid-image", {
    duration: 0.6,
    xPercent: i => (i + 1) * 40 + i * 100,
    yPercent: i => (i + 1) * 40 + i * 100
  }, "start");

gsap.from(".parallax-section", {
  scale: 1/3,
  scrollTrigger: {
    trigger: ".parallax-section",
    scrub: 1
  }
});

let pinSection = document.querySelector(".pin-section")
let pinContent1 = document.querySelector(".pin-content-1")
let pinContent2 = document.querySelector(".pin-content-2")

let pinTl = gsap.timeline({
  scrollTrigger: {
    pin: true,
    trigger: pinSection,
    scrub: true,
    start: "top top",
    end: () => `$+=${pinContent1.offsetWidth}`,
    invalidateOnRefresh: true
  }
});

pinTl.fromTo(".pin-content-1", {
  x: () => document.body.clientWidth * 0.9
}, {
  x: () => -(pinContent1.offsetWidth),
  ease: "none"
}, 0)

pinTl.fromTo(".pin-content-2", {
  x: () => -pinContent2.offsetWidth + document.body.clientWidth * 0.1
}, {
  x: () => document.body.clientWidth, 
  ease: "none"
}, 0);




// 💚 This just adds the GSAP link to this pen, don't copy this bit
import { GSAPInfoBar } from "https://codepen.io/GreenSock/pen/vYqpyLg.js"
new GSAPInfoBar({ link: "https://gsap.com/docs/v3/Plugins/ScrollSmoother/"});
// 💚 Happy tweening!