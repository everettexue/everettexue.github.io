gsap
  .timeline({
    defaults: { duration: 2, ease: "expo.inOut" },
    repeat: -1
  })
  .to("#shape1", { morphSVG: "#shape2" })
  .to("#shape1", { morphSVG: "#shape3" })
  .to("#shape1", { morphSVG: "#shape4" })
  .to("#shape1", { morphSVG: "#shape1" });
