import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

interface FormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  budget?: string;
  message: string;
  website?: string; // Honeypot field - should be empty for legitimate submissions
}

// Standard JSON response headers
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

// Simple email format validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// Sanitize and limit string length for safety
function sanitizeInput(text: string, maxLength: number = 10000): string {
  return text.trim().slice(0, maxLength);
}

// Check for common spam patterns in message content
function containsSpamPatterns(text: string): boolean {
  const spamPatterns = [
    /\[url=/i, // BBCode links
    /\[\/url\]/i,
    /<a\s+href=/i, // HTML links
    /https?:\/\/[^\s]+\s+https?:\/\/[^\s]+\s+https?:\/\//i, // Multiple URLs
    /viagra|cialis|casino|lottery|winner|bitcoin.*invest/i, // Common spam keywords
    /click\s+here.*http/i,
    /\$\$\$|make money fast|work from home.*\$/i,
  ];
  return spamPatterns.some((pattern) => pattern.test(text));
}

// Validate that a name doesn't contain suspicious patterns
function isValidName(name: string): boolean {
  // Name should not contain URLs or excessive special characters
  if (/https?:\/\//i.test(name)) return false;
  if (/[<>{}[\]\\\/]/.test(name)) return false;
  // Name should have at least some letters
  if (!/[a-zA-Z]/.test(name)) return false;
  return true;
}

export default async (req: Request, context: Context) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const formData: FormData = await req.json();

    // Honeypot spam check - if the hidden field is filled, it's a bot
    if (formData.website && formData.website.trim() !== "") {
      console.log("Honeypot triggered - likely bot submission");
      // Return success to not reveal detection to bots
      return new Response(
        JSON.stringify({ success: true, message: "Email sent successfully" }),
        {
          status: 200,
          headers: jsonHeaders,
        }
      );
    }

    // Sanitize inputs
    const name = sanitizeInput(formData.name || "", 200);
    const email = sanitizeInput(formData.email || "", 254);
    const phone = formData.phone ? sanitizeInput(formData.phone, 30) : undefined;
    const message = sanitizeInput(formData.message || "", 10000);

    // Validate required fields
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, and message are required" }),
        {
          status: 400,
          headers: jsonHeaders,
        }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid email address" }),
        {
          status: 400,
          headers: jsonHeaders,
        }
      );
    }

    // Validate name doesn't contain suspicious patterns
    if (!isValidName(name)) {
      console.log("Suspicious name pattern detected");
      return new Response(
        JSON.stringify({ error: "Please provide a valid name" }),
        {
          status: 400,
          headers: jsonHeaders,
        }
      );
    }

    // Check for spam patterns in message
    if (containsSpamPatterns(message) || containsSpamPatterns(name)) {
      console.log("Spam pattern detected in submission");
      // Return success to not reveal detection
      return new Response(
        JSON.stringify({ success: true, message: "Email sent successfully" }),
        {
          status: 200,
          headers: jsonHeaders,
        }
      );
    }

    // Get email configuration from environment variables
    const resendApiKey = Netlify.env.get("RESEND_API_KEY");
    const recipientEmail = Netlify.env.get("CONTACT_EMAIL");
    const fromEmail = Netlify.env.get("FROM_EMAIL");

    // Log which environment variables are configured (without values for security)
    console.log("Email config check:", {
      hasResendApiKey: !!resendApiKey,
      hasContactEmail: !!recipientEmail,
      hasFromEmail: !!fromEmail,
    });

    // Detect if using sandbox email (common production issue)
    const isSandboxEmail = fromEmail?.includes("onboarding@resend.dev");
    if (isSandboxEmail) {
      console.warn("WARNING: FROM_EMAIL is using Resend sandbox address (onboarding@resend.dev). This will only work for emails sent to the Resend account owner's email address. For production use, you must verify a domain in Resend and use an email address from that domain.");
    }

    const missingVars: string[] = [];
    if (!resendApiKey) missingVars.push("RESEND_API_KEY");
    if (!recipientEmail) missingVars.push("CONTACT_EMAIL");
    if (!fromEmail) missingVars.push("FROM_EMAIL");

    if (missingVars.length > 0) {
      console.error(`Missing environment variables: ${missingVars.join(", ")}`);
      return new Response(
        JSON.stringify({
          error: "Email service not configured. Please contact us directly."
        }),
        {
          status: 500,
          headers: jsonHeaders,
        }
      );
    }

    // Send email using Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        reply_to: email,
        subject: `New Inquiry from ${escapeHtml(name)}`,
        html: `
          <h2>New Inquiry from Contact Form</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Phone:</strong> ${phone ? escapeHtml(phone) : "Not provided"}</p>
          <h3>Message:</h3>
          <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
        `,
        text: `
New Inquiry from Contact Form

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}

Message:
${message}
        `.trim(),
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend API error:", errorData);
      console.error("Response status:", emailResponse.status);

      // Parse error for better user feedback and diagnostics
      let userMessage = "Failed to send email. Please try again later.";
      try {
        const errorJson = JSON.parse(errorData);
        console.error("Resend error details:", {
          name: errorJson.name,
          message: errorJson.message,
          statusCode: errorJson.statusCode,
        });

        if (errorJson.name === "validation_error") {
          if (errorJson.message?.includes("verify a domain")) {
            userMessage = "Email service configuration issue. Please contact us directly via phone or email.";
            console.error("SOLUTION: Domain verification required. Go to https://resend.com/domains and verify a domain. Then update FROM_EMAIL to use an address from that verified domain (e.g., noreply@yourverifieddomain.com).");
          } else if (errorJson.message?.includes("can only send")) {
            userMessage = "Email service configuration issue. Please contact us directly.";
            console.error("SOLUTION: Sandbox mode limitation detected. The onboarding@resend.dev email can only send to the Resend account owner. Verify a domain at https://resend.com/domains and update FROM_EMAIL to use that domain.");
          } else if (errorJson.message?.includes("invalid") && errorJson.message?.includes("from")) {
            userMessage = "Email service configuration issue. Please contact us directly.";
            console.error("SOLUTION: Invalid FROM_EMAIL format. Should be 'Name <email@domain.com>' or just 'email@domain.com'.");
          } else {
            userMessage = "Email service configuration issue. Please contact us directly.";
            console.error("Validation error:", errorJson.message);
          }
        } else if (emailResponse.status === 403 || errorJson.statusCode === 403) {
          userMessage = "Email service configuration issue. Please contact us directly.";
          console.error("SOLUTION: 403 Forbidden - API key may be invalid, expired, or the domain is not verified for the FROM_EMAIL address.");
        } else if (emailResponse.status === 401) {
          userMessage = "Email service configuration issue. Please contact us directly.";
          console.error("SOLUTION: 401 Unauthorized - RESEND_API_KEY is invalid. Get a new API key from https://resend.com/api-keys");
        } else if (emailResponse.status === 429) {
          userMessage = "Too many requests. Please wait a moment and try again.";
          console.error("Rate limited by Resend API.");
        }
      } catch {
        console.error("Could not parse Resend error response as JSON");
      }

      return new Response(
        JSON.stringify({ error: userMessage }),
        {
          status: 500,
          headers: jsonHeaders,
        }
      );
    }

    console.log("Email sent successfully");

    // Send confirmation email to the person who submitted the form
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: "Got your message — Scale Rebel Studio",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
              <p>Hey ${escapeHtml(name.split(" ")[0])},</p>
              <p>Just confirming I received your inquiry. I'll review everything and get back to you within one week.</p>
              <p>In the meantime, feel free to reply to this email if you have anything to add.</p>
              <p style="margin-top: 2em;">
                — Scale Rebel Studio<br>
                <a href="https://www.thescalerebel.com" style="color: #555;">thescalerebel.com</a>
              </p>
            </div>
          `,
          text: `Hey ${name.split(" ")[0]},\n\nJust confirming I received your inquiry. I'll review everything and get back to you within one week.\n\nIn the meantime, feel free to reply to this email if you have anything to add.\n\n— Scale Rebel Studio\nhttps://www.thescalerebel.com`,
          reply_to: recipientEmail,
        }),
      });
      console.log("Confirmation email sent to submitter");
    } catch (confirmError) {
      // Don't fail the whole request if confirmation email fails
      console.error("Failed to send confirmation email:", confirmError);
    }

    // Store inquiry in database
    try {
      const sql = neon();
      await sql`CREATE TABLE IF NOT EXISTS inquiries (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT,
        budget TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`;
      const company = formData.company ? sanitizeInput(formData.company, 200) : null;
      const budget = formData.budget ? sanitizeInput(formData.budget, 100) : null;
      await sql`INSERT INTO inquiries (name, email, company, budget, message) VALUES (${name}, ${email}, ${company}, ${budget}, ${message})`;
      console.log("Inquiry stored in database");
    } catch (dbError) {
      // Don't fail the request if database storage fails
      console.error("Failed to store inquiry in database:", dbError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      {
        status: 200,
        headers: jsonHeaders,
      }
    );
  } catch (error) {
    console.error("Error processing form submission:", error);

    // Provide more specific error for JSON parsing issues
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: "Invalid request format" }),
        {
          status: 400,
          headers: jsonHeaders,
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: jsonHeaders,
      }
    );
  }
};

export const config: Config = {
  path: "/api/send-email",
};
