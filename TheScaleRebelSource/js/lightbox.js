(function () {
  const overlay = document.querySelector("#lightbox");
  if (!overlay) return;

  const dialog = overlay.querySelector(".lightbox-dialog");
  const body = overlay.querySelector(".lightbox-body");
  const title = overlay.querySelector("#lightbox-title");
  const closeBtn = overlay.querySelector("[data-lightbox-close]");

function ensureIgLink() {
  let ig = overlay.querySelector("[data-lightbox-instagram]");
  if (ig) return ig;

  ig = document.createElement("a");
  ig.setAttribute("data-lightbox-instagram", "1");
  ig.className = "lightbox-iglink";
  ig.textContent = "View on Instagram";
  ig.target = "_blank";
  ig.rel = "noopener noreferrer";

  // Place it in the top bar, before the close button
  const bar = overlay.querySelector(".lightbox-bar");
  const close = overlay.querySelector("[data-lightbox-close]");
  if (bar && close) {
    bar.insertBefore(ig, close);
  } else if (bar) {
    bar.appendChild(ig);
  } else {
    overlay.appendChild(ig);
  }
  return ig;
}



  let lastActiveEl = null;
  let currentMedia = null; // Track current media element (img or video)

  const focusableSelector = [
    "button","[href]","input","select","textarea","[tabindex]:not([tabindex='-1'])"
  ].join(",");

  function getFocusable(container) {
    return Array.from(container.querySelectorAll(focusableSelector))
      .filter((el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
  }

  function openLightbox(src, altText, mediaType) {
    lastActiveEl = document.activeElement;

    // Clear previous media
    if (currentMedia) {
      currentMedia.remove();
      currentMedia = null;
    }

    // Create appropriate media element
    if (mediaType === "video") {
      const video = document.createElement("video");
      video.id = "lightbox-video";
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("aria-label", altText || "Portfolio video");
      body.appendChild(video);
      currentMedia = video;
      title.textContent = "Video Preview";
    } else {
      const img = document.createElement("img");
      img.id = "lightbox-image";
      img.src = src;
      img.alt = altText || "Tattoo work photo";
      body.appendChild(img);
      currentMedia = img;
      title.textContent = "Preview";
    }

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }

  function closeLightbox() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");

    // Clean up media element
    if (currentMedia) {
      if (currentMedia.tagName === "VIDEO") {
        currentMedia.pause();
        currentMedia.src = "";
      }
      currentMedia.remove();
      currentMedia = null;
    }

    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    if (lastActiveEl && typeof lastActiveEl.focus === "function") lastActiveEl.focus();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lightbox]");
    if (!btn) return;
    const src = btn.getAttribute("data-src") || btn.getAttribute("href");
    const altText = btn.getAttribute("data-alt") || btn.getAttribute("aria-label") || "Tattoo work photo";
    const mediaType = btn.getAttribute("data-type") || "image";
    if (!src) return;
    e.preventDefault();
    openLightbox(src, altText, mediaType);
  });

  closeBtn.addEventListener("click", closeLightbox);
  overlay.addEventListener("click", (e) => {
  // Close when clicking the dimmed background (outside the content)
  const inner = overlay.querySelector(".lightbox-inner") || overlay.querySelector(".lightbox-content");
  if (!inner) {
    if (e.target === overlay) close();
    return;
  }
  if (e.target === overlay || !inner.contains(e.target)) close();
});
});

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); return; }
    if (e.key === "Tab") {
      const focusables = getFocusable(overlay);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1], active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  });
})();

(function () {
  // Auto-open from deep link: /portfolio.html#img-01
  const hash = location.hash || "";
  const m = hash.match(/^#img-(\d{2})$/);
  if (!m) return;

  const target = document.getElementById(hash.slice(1));
  if (!target) return;

  // Scroll into view and open lightbox
  try { target.scrollIntoView({ block: "center", behavior: "instant" }); } catch (e) { target.scrollIntoView(); }

  const btn = target.querySelector("[data-lightbox]");
  if (btn) {
    // Trigger click to reuse existing handlers
    btn.click();
  }
})();
