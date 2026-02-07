async function loadProjects(){
  const host = document.querySelector("[data-projects]");
  if (!host) return;
  try{
    const res = await fetch("/data/projects.json", { cache: "no-cache" });
    const items = await res.json();
    host.innerHTML = items.map(p => `
      <a class="project-pill" href="${p.url}" target="_blank" rel="noopener">
        <span class="project-pill-name">${p.name}</span>
        <span class="project-pill-desc">${p.description || ""}</span>
        <span class="project-pill-arrow">↗</span>
      </a>
    `).join("");
  } catch(e){
    host.innerHTML = "<div class='panel'><p>Projects failed to load.</p></div>";
  }
}
document.addEventListener("DOMContentLoaded", loadProjects);
