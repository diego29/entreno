// Liquid glass: mueve la "gota" de vidrio a la pestaña activa del menú.
(function () {
  const nav = document.querySelector(".tabs > div"); if (!nav) return;
  const lens = document.createElement("i"); lens.className = "lens"; lens.setAttribute("aria-hidden", "true"); nav.prepend(lens);
  let first = true;
  const place = () => {
    const on = nav.querySelector(".tab.on");
    if (!on || !on.offsetWidth) { lens.style.opacity = 0; return; }
    if (first) { lens.style.transition = "none"; }
    lens.style.opacity = 1; lens.style.width = on.offsetWidth + "px"; lens.style.transform = `translateX(${on.offsetLeft}px)`;
    if (first) { void lens.offsetWidth; lens.style.transition = ""; first = false; }
  };
  new MutationObserver(place).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", place); document.fonts?.ready?.then(place); place();
  nav.addEventListener("pointerdown", e => { if (!e.target.closest(".tab")) return; lens.classList.remove("squish"); void lens.offsetWidth; lens.classList.add("squish"); });
})();
