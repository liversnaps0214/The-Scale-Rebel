(function () {
  const grid = document.querySelector("[data-featured-grid]");
  if (!grid) return;

  // Check if grid already has loaded images (back/forward navigation)
  // This prevents reloading when user navigates back to home page
  if (grid.dataset.loaded === "true" && grid.children.length > 0) {
    return;
  }

  // Thumbnail size for optimized loading (matches grid cell size)
  const THUMBNAIL_SIZE = 400;
  const THUMBNAIL_QUALITY = 75;
  const EXPECTED_COUNT = 6; // Number of featured items to show

  function proxyThumb(instagramUrl) {
    if (!instagramUrl) return "";
    return `/api/instagram-image?raw=1&url=${encodeURIComponent(instagramUrl)}&w=${THUMBNAIL_SIZE}&q=${THUMBNAIL_QUALITY}`;
  }

  // Create a skeleton placeholder cell
  function createSkeletonItem() {
    const galleryItem = document.createElement("div");
    galleryItem.className = "gallery-item gallery-item--loading";

    const placeholder = document.createElement("div");
    placeholder.className = "gallery-placeholder featured-shimmer";

    galleryItem.appendChild(placeholder);
    return galleryItem;
  }

  function createGalleryItem(item, idx) {
    const thumb = proxyThumb(item.instagramUrl);
    const instagramUrl = item.instagramUrl || "";
    const alt = item.alt || `Featured tattoo work ${idx + 1}`;

    const galleryItem = document.createElement("div");
    galleryItem.className = "gallery-item";
    // Start with opacity 0 for fade-in effect
    galleryItem.style.opacity = "0";
    galleryItem.style.transition = "opacity 0.3s ease";

    // Create clickable link that opens Instagram directly
    const link = document.createElement("a");
    link.className = "featured-tile";
    link.href = instagramUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `View ${alt} on Instagram`);

    const img = document.createElement("img");
    img.className = "gallery-image";
    img.alt = alt;
    img.loading = "eager";
    img.decoding = "async";
    // Set explicit dimensions to prevent layout shift
    img.width = THUMBNAIL_SIZE;
    img.height = THUMBNAIL_SIZE;

    link.appendChild(img);
    galleryItem.appendChild(link);

    return { element: galleryItem, img, thumb, instagramUrl };
  }

  // Preload an image and return a promise
  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = src;
    });
  }

  // STEP 1: Immediately create skeleton placeholders to show loading state
  grid.innerHTML = "";
  const skeletons = [];
  for (let i = 0; i < EXPECTED_COUNT; i++) {
    const skeleton = createSkeletonItem();
    grid.appendChild(skeleton);
    skeletons.push(skeleton);
  }

  // STEP 2: Fetch and render featured images, replacing skeletons
  fetch("data/featured.json")
    .then((r) => r.json())
    .then(async (items) => {
      items = Array.isArray(items) ? items.slice(0, EXPECTED_COUNT) : [];

      // Create all gallery items (but don't add to DOM yet)
      const galleryItems = items.map((item, idx) => createGalleryItem(item, idx));

      // Preload all images in parallel
      const preloadPromises = galleryItems.map((gi) =>
        preloadImage(gi.thumb).catch(() => gi.thumb) // Continue even if one fails
      );

      // Wait for all images to preload
      await Promise.all(preloadPromises);

      // Replace skeletons with loaded images
      galleryItems.forEach((gi, idx) => {
        gi.img.src = gi.thumb;
        // Replace skeleton with actual gallery item
        if (skeletons[idx] && skeletons[idx].parentNode === grid) {
          grid.replaceChild(gi.element, skeletons[idx]);
        } else {
          grid.appendChild(gi.element);
        }
        // Trigger reflow and fade in
        gi.element.offsetHeight;
        gi.element.style.opacity = "1";
      });

      // Remove any extra skeletons if fewer items than expected
      for (let i = items.length; i < skeletons.length; i++) {
        if (skeletons[i] && skeletons[i].parentNode === grid) {
          grid.removeChild(skeletons[i]);
        }
      }

      // Mark grid as loaded to prevent re-fetching on back navigation
      grid.dataset.loaded = "true";
    })
    .catch((err) => console.error("Error loading featured images:", err));
})();
