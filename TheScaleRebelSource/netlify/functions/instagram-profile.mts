import type { Context, Config } from "@netlify/functions";

interface InstagramMediaItem {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp: string;
}

interface InstagramApiResponse {
  data: InstagramMediaItem[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

export default async (req: Request, context: Context) => {
  // Check for Instagram Graph API credentials
  const accessToken = Netlify.env.get("INSTAGRAM_ACCESS_TOKEN");
  const userId = Netlify.env.get("INSTAGRAM_USER_ID");

  if (!accessToken || !userId) {
    return new Response(
      JSON.stringify({
        error: "Instagram API not configured",
        message: "To automatically fetch Instagram posts, you need to set up INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID environment variables.",
        setup_instructions: {
          step1: "Ensure your Instagram account is a Business or Creator account",
          step2: "Connect your Instagram account to a Facebook Page",
          step3: "Create a Meta Developer app at https://developers.facebook.com/",
          step4: "Add Instagram Graph API to your app",
          step5: "Generate an access token with instagram_basic permission",
          step6: "Get your Instagram User ID from the API",
          step7: "Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID in Netlify environment variables"
        }
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

  try {
    // Fetch media from Instagram Graph API
    const apiUrl = `https://graph.instagram.com/${userId}/media?fields=id,media_type,media_url,thumbnail_url,permalink,caption,timestamp&limit=${limit}&access_token=${accessToken}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Instagram API error:", errorData);

      if (response.status === 190 || response.status === 401) {
        return new Response(
          JSON.stringify({
            error: "Instagram access token expired or invalid",
            message: "Please refresh your Instagram access token"
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to fetch Instagram media" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data: InstagramApiResponse = await response.json();

    // Transform the data to a simpler format
    const posts = data.data.map((item) => ({
      instagramUrl: item.permalink,
      imageUrl: item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url,
      mediaType: item.media_type,
      caption: item.caption || "",
      timestamp: item.timestamp,
      alt: item.caption
        ? item.caption.substring(0, 100) + (item.caption.length > 100 ? "..." : "")
        : "Instagram post"
    }));

    return new Response(
      JSON.stringify({
        posts,
        count: posts.length,
        hasMore: !!data.paging?.next
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching Instagram profile:", error);
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
  path: "/api/instagram-profile",
};
