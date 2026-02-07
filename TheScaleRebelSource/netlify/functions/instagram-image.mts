import type { Context, Config } from "@netlify/functions";

// Helper to create Netlify Image CDN URL with WebP format and optimized size
function getOptimizedImageUrl(imageUrl: string, width: number = 600, quality: number = 80): string {
  return `/.netlify/images?url=${encodeURIComponent(imageUrl)}&w=${width}&fm=webp&q=${quality}`;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const postUrl = url.searchParams.get("url");
  // Optional size parameters for client customization
  const width = parseInt(url.searchParams.get("w") || "600", 10);
  const quality = parseInt(url.searchParams.get("q") || "80", 10);

  if (!postUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate it's an Instagram URL
  if (!(postUrl.includes("instagram.com/p/") || postUrl.includes("instagram.com/reel/") || postUrl.includes("instagram.com/tv/"))) {
    return new Response(JSON.stringify({ error: "Invalid Instagram URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch the Instagram post page
    const response = await fetch(postUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch Instagram post" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const html = await response.text();

    // Extract image URL from OpenGraph meta tag
    const ogImageMatch = html.match(
      /<meta\s+property="og:image"\s+content="([^"]+)"/i
    ) || html.match(
      /<meta\s+content="([^"]+)"\s+property="og:image"/i
    );

    if (!ogImageMatch || !ogImageMatch[1]) {
      return new Response(
        JSON.stringify({ error: "Could not find image in Instagram post" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Decode HTML entities in the URL
    const imageUrl = ogImageMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&#x3D;/g, "=");

    // Generate optimized image URL via Netlify Image CDN
    const optimizedUrl = getOptimizedImageUrl(imageUrl, width, quality);

    // Return JSON with both original and optimized image URLs
    const raw = url.searchParams.get("raw") === "1";
    if (raw && imageUrl) {
      // Redirect to optimized Netlify Image CDN URL instead of raw Instagram URL
      // Use 307 with cache headers so browsers cache the redirect itself
      const redirectUrl = new URL(optimizedUrl, url.origin).toString();
      return new Response(null, {
        status: 307,
        headers: {
          "Location": redirectUrl,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    return new Response(JSON.stringify({
      imageUrl: optimizedUrl,
      originalUrl: imageUrl
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching Instagram image:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const config: Config = {
  path: "/api/instagram-image",
};
