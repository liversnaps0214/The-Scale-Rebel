function setActiveNav(){
  const path = (location.pathname || "/").replace(/\/index\.html$/, "/");
  document.querySelectorAll(".nav-link").forEach(a => {
    const href = (a.getAttribute("href") || "").replace(/\/index\.html$/, "/");
    if (href === path) a.classList.add("active");
  });
}

function wireMobileNav(){
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    toggle.setAttribute("aria-label", nav.classList.contains("open") ? "Close menu" : "Open menu");
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("open")) return;
    const inside = nav.contains(e.target) || toggle.contains(e.target);
    if (!inside) {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function wireYear(){
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

function wireHeaderScroll(){
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 6);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function wireReveals(){
  const targets = Array.from(document.querySelectorAll(
    ".section, .card, .panel, .list-item, .form-card, .hero-inner"
  ));
  if (!targets.length) return;
  targets.forEach(el => el.classList.add("reveal"));

  if (!("IntersectionObserver" in window)) {
    targets.forEach(el => el.classList.add("in-view"));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (isIntersecting) {
        target.classList.add("in-view");
        io.unobserve(target);
      }
    });
  }, { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" });

  targets.forEach(el => io.observe(el));
}

async function postJSON(url, data){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function wireContactForm(){
  const form = document.querySelector("form[data-contact-form]");
  if (!form) return;

  const submit = form.querySelector("button[type=submit]");
  const notice = form.querySelector("[data-notice]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (notice) notice.textContent = "";
    if (submit) { submit.disabled = true; submit.textContent = "Sending…"; }

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    const { ok, json } = await postJSON("/api/send-email", payload);

    if (submit) { submit.disabled = false; submit.textContent = "Send"; }

    if (!notice) return;
    if (ok){
      notice.className = "notice ok";
      notice.textContent = "Thanks — I’ll get back to you soon.";
      form.reset();
    } else {
      notice.className = "notice bad";
      notice.textContent = json?.error || "Something went wrong. Please try again.";
    }
  });
}

document.addEventListener("includes:loaded", () => {
  setActiveNav();
  wireMobileNav();
  wireHeaderScroll();
  wireReveals();
  wireYear();
  wireContactForm();
});

// If partials aren't used for some reason, still try to run essentials.
document.addEventListener("DOMContentLoaded", () => {
  wireYear();
  wireHeaderScroll();
  wireReveals();
});
