/**
 * Portfolio Image Prefetcher
 *
 * Runs on the home page to prefetch portfolio images in the background.
 * This allows portfolio images to be cached before the user navigates
 * to the portfolio page, resulting in faster perceived load times.
 */
(function () {
  // Only run on home page
  if (!document.body.classList.contains("page-home")) return;

  const THUMBNAIL_SIZE = 400;
  const THUMBNAIL_QUALITY = 75;
  const PREFETCH_DELAY = 2000; // Wait 2 seconds after page load before starting
  const PREFETCH_BATCH_SIZE = 3; // Prefetch 3 images at a time
  const PREFETCH_BATCH_DELAY = 500; // Wait 500ms between batches

  function buildPrefetchUrl(instagramUrl) {
    return `/api/instagram-image?url=${encodeURIComponent(instagramUrl)}&w=${THUMBNAIL_SIZE}&q=${THUMBNAIL_QUALITY}`;
  }

  async function prefetchImage(url) {
    try {
      // Use fetch with low priority to avoid competing with visible content
      const response = await fetch(url, {
        priority: "low",
        cache: "force-cache"
      });
      // Just fetch the JSON response to trigger the backend caching
      if (response.ok) {
        await response.json();
      }
    } catch (e) {
      // Silently ignore prefetch errors
    }
  }

  async function prefetchPortfolioImages() {
    try {
      // Fetch the portfolio data
      const response = await fetch("data/portfolio-images.json", { cache: "force-cache" });
      if (!response.ok) return;

      const items = await response.json();

      // Filter to items with Instagram URLs
      const instagramItems = items.filter(
        (item) => item.instagram && item.instagram.trim() !== ""
      );

      // Prefetch in small batches with delays to avoid overwhelming the network
      for (let i = 0; i < instagramItems.length; i += PREFETCH_BATCH_SIZE) {
        const batch = instagramItems.slice(i, i + PREFETCH_BATCH_SIZE);

        // Prefetch batch in parallel
        await Promise.all(
          batch.map((item) => prefetchImage(buildPrefetchUrl(item.instagram)))
        );

        // Small delay between batches
        if (i + PREFETCH_BATCH_SIZE < instagramItems.length) {
          await new Promise((resolve) => setTimeout(resolve, PREFETCH_BATCH_DELAY));
        }
      }
    } catch (e) {
      // Silently ignore prefetch errors
    }
  }

  // Wait for page to be mostly idle before starting prefetch
  if ("requestIdleCallback" in window) {
    requestIdleCallback(
      () => {
        setTimeout(prefetchPortfolioImages, PREFETCH_DELAY);
      },
      { timeout: 5000 }
    );
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(prefetchPortfolioImages, PREFETCH_DELAY + 1000);
  }
})();
