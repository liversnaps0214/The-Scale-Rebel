(function () {
  const grid = document.querySelector("[data-portfolio-grid]");
  const btn = document.querySelector("[data-load-more]");
  const counter = document.querySelector("[data-gallery-count]");
  const loadingIndicator = document.querySelector("[data-loading]");
  if (!grid || !btn) return;

  let items = [];
  let totalLoaded = 0;

  // Cache for Instagram image URLs
  const imageCache = new Map();

  // Thumbnail size for optimized loading (matches grid cell size)
  const THUMBNAIL_SIZE = 400;
  const THUMBNAIL_QUALITY = 75;

  // Concurrent requests for loading images
  const CONCURRENT_REQUESTS = 6;

  const PLACEHOLDER_THUMB = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111"/>
          <stop offset="1" stop-color="#2a2a2a"/>
        </linearGradient>
      </defs>
      <rect width="800" height="800" fill="url(#g)"/>
      <rect x="40" y="40" width="720" height="720" rx="36" ry="36" fill="none" stroke="#444" stroke-width="6"/>
      <text x="50%" y="47%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#ddd">View on Instagram</text>
      <text x="50%" y="55%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#9a9a9a">Thumbnail unavailable</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  })();

  // Skeleton placeholder SVG (animated loading state)
  const SKELETON_PLACEHOLDER = (() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e0e0e0">
            <animate attributeName="offset" values="-2;1" dur="1.5s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" stop-color="#f0f0f0">
            <animate attributeName="offset" values="-1;2" dur="1.5s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" stop-color="#e0e0e0">
            <animate attributeName="offset" values="0;3" dur="1.5s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#shimmer)"/>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  })();

  function showLoading(show) {
    if (loadingIndicator) {
      loadingIndicator.hidden = !show;
    }
  }

  function updateCounter() {
    if (counter) {
      counter.textContent = `Showing ${totalLoaded} of ${items.length}`;
    }
  }

  // Fetch Instagram image URL via our API (now returns optimized Netlify Image CDN URL)
  async function fetchInstagramImage(instagramUrl) {
    // Check cache first
    if (imageCache.has(instagramUrl)) {
      return imageCache.get(instagramUrl);
    }

    try {
      // Request optimized thumbnail size from the API
      const response = await fetch(`/api/instagram-image?url=${encodeURIComponent(instagramUrl)}&w=${THUMBNAIL_SIZE}&q=${THUMBNAIL_QUALITY}`);
      if (!response.ok) {
        console.error("Failed to fetch Instagram image for:", instagramUrl);
        return PLACEHOLDER_THUMB;
      }
      const data = await response.json();
      if (data.imageUrl) {
        imageCache.set(instagramUrl, data.imageUrl);
        return data.imageUrl;
      }
    } catch (error) {
      console.error("Error fetching Instagram image:", error);
    }
    return PLACEHOLDER_THUMB;
  }

  // Resolve the image URL - either direct src or via Instagram API
  async function resolveImageUrl(item) {
    // If item has direct src, use it
    if (item.src && item.src.trim() !== "") {
      return {
        src: item.src,
        thumbnail: item.thumbnail || item.src,
        instagramUrl: item.instagram || item.instagramUrl || ""
      };
    }

    // If item has Instagram URL, fetch the image via API
    if (item.instagram && item.instagram.trim() !== "") {
      const imageUrl = await fetchInstagramImage(item.instagram);
      return {
        src: imageUrl,
        thumbnail: imageUrl,
        instagramUrl: item.instagram
      };
    }

    return null;
  }

  // Create a placeholder gallery item (skeleton cell)
  function createPlaceholderItem(index) {
    const number = index + 1;
    const id = `img-${String(number).padStart(2, "0")}`;

    const galleryItem = document.createElement("div");
    galleryItem.className = "gallery-item gallery-item--loading";
    galleryItem.id = id;
    galleryItem.setAttribute("data-index", index);

    // Create placeholder structure
    const placeholder = document.createElement("div");
    placeholder.className = "gallery-placeholder";

    const img = document.createElement("img");
    img.src = SKELETON_PLACEHOLDER;
    img.alt = "";
    img.width = THUMBNAIL_SIZE;
    img.height = THUMBNAIL_SIZE;
    img.setAttribute("aria-hidden", "true");

    placeholder.appendChild(img);
    galleryItem.appendChild(placeholder);

    return galleryItem;
  }

  // Update a placeholder with actual image content
  function updatePlaceholderWithImage(index, item, resolved) {
    const galleryItem = grid.querySelector(`[data-index="${index}"]`);
    if (!galleryItem || !resolved) return;

    const number = index + 1;

    // Create the actual content
    const instagramUrl = item.instagram || item.instagramUrl || resolved.instagramUrl || "";
    const trigger = document.createElement("a");
    trigger.className = "gallery-trigger";
    trigger.href = instagramUrl || resolved.src;
    trigger.target = "_blank";
    trigger.rel = "noopener noreferrer";
    trigger.setAttribute("aria-label", `View ${item.alt || `portfolio image ${number}`} on Instagram`);

    // Create thumbnail image
    const img = document.createElement("img");
    img.loading = index < 12 ? "eager" : "lazy"; // Eager load first 12 images
    img.decoding = "async";
    img.alt = item.alt || `Portfolio image ${number}`;
    img.width = THUMBNAIL_SIZE;
    img.height = THUMBNAIL_SIZE;

    // Add fade-in effect when image loads
    img.style.opacity = "0";
    img.style.transition = "opacity 0.3s ease";
    img.onload = () => {
      img.style.opacity = "1";
    };

    img.src = resolved.thumbnail;

    trigger.appendChild(img);

    // Replace placeholder content with actual content
    galleryItem.innerHTML = "";
    galleryItem.appendChild(trigger);
    galleryItem.classList.remove("gallery-item--loading");

    totalLoaded++;
    updateCounter();
  }

  // Create all placeholder cells upfront
  function createPlaceholderGrid() {
    // Clear any existing content
    grid.innerHTML = "";

    // Create all placeholder cells
    for (let i = 0; i < items.length; i++) {
      const placeholder = createPlaceholderItem(i);
      grid.appendChild(placeholder);
    }

    if (counter) counter.textContent = `Loading 0 of ${items.length}`;
  }

  // Load images and fill in placeholders
  async function loadImagesIntoPlaceholders() {
    showLoading(true);

    // Process all items with controlled concurrency
    for (let i = 0; i < items.length; i += CONCURRENT_REQUESTS) {
      const chunk = items.slice(i, i + CONCURRENT_REQUESTS);
      const chunkStartIndex = i;

      // Start all requests in this chunk in parallel
      const chunkPromises = chunk.map((item, idx) => {
        const absoluteIndex = chunkStartIndex + idx;
        return resolveImageUrl(item).then(resolved => {
          // Update the placeholder immediately when this image resolves
          updatePlaceholderWithImage(absoluteIndex, item, resolved);
        });
      });

      // Wait for this chunk to complete before starting next
      await Promise.all(chunkPromises);
    }

    // All done
    showLoading(false);
    btn.disabled = true;
    btn.textContent = "All loaded";
  }

  // Load portfolio data from JSON file
  async function loadPortfolioData() {
    showLoading(true);

    try {
      const res = await fetch("data/portfolio-images.json");
      if (!res.ok) throw new Error("Failed to load portfolio-images.json");
      items = await res.json();

      // Filter out items without src or instagram (empty placeholders)
      items = items.filter(item =>
        (item.src && item.src.trim() !== "") ||
        (item.instagram && item.instagram.trim() !== "")
      );

      // Create the pre-sized grid with placeholder cells
      createPlaceholderGrid();

      // Start loading images into placeholders
      loadImagesIntoPlaceholders();
    } catch (err) {
      console.error("Error loading portfolio:", err);
      showLoading(false);
      if (counter) counter.textContent = "Unable to load portfolio images";
    }
  }

  // Hide load more button - we load everything progressively
  btn.style.display = "none";

  // Initialize
  loadPortfolioData();

  // Handle deep links (e.g. #img-18)
  const m = (location.hash || "").match(/^#img-(\d{2})$/);
  if (m) {
    const targetId = `img-${m[1]}`;
    // Wait for images to load then scroll to target
    const scrollToTarget = () => {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (totalLoaded < items.length) {
        // Target not yet loaded, check again
        setTimeout(scrollToTarget, 200);
      }
    };
    setTimeout(scrollToTarget, 500);
  }
})();
