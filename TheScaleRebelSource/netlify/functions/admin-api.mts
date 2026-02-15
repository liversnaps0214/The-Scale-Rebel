import type { Context, Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

// Initialize database tables on first request
async function initializeDatabase(sql: ReturnType<typeof neon>) {
  try {
    // Create clients table
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        status TEXT DEFAULT 'lead',
        budget TEXT,
        deadline TEXT,
        cost TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create inquiries table
    await sql`
      CREATE TABLE IF NOT EXISTS inquiries (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT,
        budget TEXT,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create OTP codes table
    await sql`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create admin sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

// Generate a random 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate a random session token
function generateSessionToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Session-based authentication
async function checkAuth(context: Context, sql: ReturnType<typeof neon>): Promise<boolean> {
  const authHeader = context.request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const sessions = await sql`
      SELECT * FROM admin_sessions
      WHERE token = ${token}
        AND expires_at > NOW()
    `;
    return sessions.length > 0;
  } catch (error) {
    console.error("Auth check error:", error);
    return false;
  }
}

// JSON response helper
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

// Error response helper
function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// Handle CORS preflight
function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// POST /api/admin/otp/send — send OTP email (no auth required)
async function sendOTP(context: Context, sql: ReturnType<typeof neon>) {
  try {
    const body = await context.request.json();
    const { email } = body;

    if (!email) {
      return errorResponse("Email is required", 400);
    }

    // Check if this email is the allowed admin email
    const adminEmail = Netlify.env.get("ADMIN_EMAIL");
    if (!adminEmail) {
      console.error("ADMIN_EMAIL not configured");
      return errorResponse("Admin login not configured", 500);
    }

    if (email.toLowerCase() !== adminEmail.toLowerCase()) {
      // Don't reveal whether the email exists — just say "sent"
      // This prevents email enumeration
      return jsonResponse({ sent: true });
    }

    // Clean up expired OTP codes
    await sql`DELETE FROM otp_codes WHERE expires_at < NOW()`;

    // Rate limit: max 5 OTP requests per email in last 15 minutes
    const recentCodes = await sql`
      SELECT COUNT(*) as count FROM otp_codes
      WHERE email = ${email.toLowerCase()}
        AND created_at > NOW() - INTERVAL '15 minutes'
    `;

    if (recentCodes[0].count >= 5) {
      return errorResponse("Too many attempts. Try again later.", 429);
    }

    // Generate OTP (expires in 10 minutes)
    const code = generateOTP();
    await sql`
      INSERT INTO otp_codes (email, code, expires_at)
      VALUES (${email.toLowerCase()}, ${code}, NOW() + INTERVAL '10 minutes')
    `;

    // Send OTP via Resend
    const resendApiKey = Netlify.env.get("RESEND_API_KEY");
    const fromEmail = Netlify.env.get("FROM_EMAIL");

    if (!resendApiKey || !fromEmail) {
      console.error("Email config missing: RESEND_API_KEY or FROM_EMAIL");
      return errorResponse("Email service not configured", 500);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `The Scale Rebel <${fromEmail}>`,
        to: [email],
        subject: "Your admin login code",
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 440px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7;">
                    <tr>
                      <td style="padding: 40px 36px 32px;">
                        <p style="margin: 0 0 6px; font-size: 14px; color: #71717a;">thescalerebel.com</p>
                        <h1 style="margin: 0 0 24px; font-size: 22px; font-weight: 600; color: #18181b;">Sign in to your admin dashboard</h1>
                        <p style="margin: 0 0 24px; font-size: 15px; color: #3f3f46; line-height: 1.5;">Enter this code to verify your identity. It expires in 10 minutes.</p>
                        <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 20px; text-align: center; margin-bottom: 24px;">
                          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #18181b; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">${code}</span>
                        </div>
                        <p style="margin: 0; font-size: 13px; color: #a1a1aa; line-height: 1.5;">If you didn't request this code, you can safely ignore this email. No one can access your account without this code.</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 36px 32px;">
                        <div style="border-top: 1px solid #e4e4e7; padding-top: 20px;">
                          <p style="margin: 0; font-size: 12px; color: #a1a1aa;">The Scale Rebel &mdash; Websites Worth Owning</p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json().catch(() => ({}));
      console.error("Resend API error:", errorData);
      return errorResponse("Failed to send verification email", 500);
    }

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error("Error sending OTP:", error);
    return errorResponse("Failed to send verification code", 500);
  }
}

// POST /api/admin/otp/verify — verify OTP and create session (no auth required)
async function verifyOTP(context: Context, sql: ReturnType<typeof neon>) {
  try {
    const body = await context.request.json();
    const { email, code } = body;

    if (!email || !code) {
      return errorResponse("Email and code are required", 400);
    }

    // Check if this email is the allowed admin email
    const adminEmail = Netlify.env.get("ADMIN_EMAIL");
    if (!adminEmail || email.toLowerCase() !== adminEmail.toLowerCase()) {
      return errorResponse("Invalid code", 401);
    }

    // Find valid OTP
    const otpCodes = await sql`
      SELECT * FROM otp_codes
      WHERE email = ${email.toLowerCase()}
        AND code = ${code}
        AND expires_at > NOW()
        AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (otpCodes.length === 0) {
      return errorResponse("Invalid or expired code", 401);
    }

    // Mark OTP as used
    await sql`UPDATE otp_codes SET used = TRUE WHERE id = ${otpCodes[0].id}`;

    // Clean up old sessions for this email
    await sql`DELETE FROM admin_sessions WHERE expires_at < NOW()`;

    // Create session (valid for 24 hours)
    const token = generateSessionToken();
    await sql`
      INSERT INTO admin_sessions (token, email, expires_at)
      VALUES (${token}, ${email.toLowerCase()}, NOW() + INTERVAL '24 hours')
    `;

    return jsonResponse({ token, expiresIn: 86400 });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return errorResponse("Verification failed", 500);
  }
}

// POST /api/admin/otp/logout — invalidate session
async function logout(context: Context, sql: ReturnType<typeof neon>) {
  try {
    const authHeader = context.request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
    }
    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Error during logout:", error);
    return jsonResponse({ success: true }); // Always succeed for logout
  }
}

// GET /api/admin/clients - list all or get single client
async function getClients(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const url = new URL(context.request.url);
    const clientId = url.searchParams.get("id");

    if (clientId) {
      // Get single client with their inquiries
      const clients = await sql`
        SELECT * FROM clients WHERE id = ${parseInt(clientId)}
      `;

      if (clients.length === 0) {
        return errorResponse("Client not found", 404);
      }

      const client = clients[0];
      const inquiries = await sql`
        SELECT * FROM inquiries WHERE client_id = ${parseInt(clientId)}
        ORDER BY created_at DESC
      `;

      return jsonResponse({ client: { ...client, inquiries } });
    } else {
      // Get all clients
      const clients = await sql`
        SELECT * FROM clients ORDER BY updated_at DESC
      `;
      return jsonResponse({ clients });
    }
  } catch (error) {
    console.error("Error fetching clients:", error);
    return errorResponse("Failed to fetch clients", 500);
  }
}

// POST /api/admin/clients - create new client
async function createClient(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const body = await context.request.json();
    const { name, email, phone, company, status = "lead", budget, deadline, cost, notes } = body;

    if (!name) {
      return errorResponse("Name is required", 400);
    }

    const result = await sql`
      INSERT INTO clients (name, email, phone, company, status, budget, deadline, cost, notes)
      VALUES (${name}, ${email || null}, ${phone || null}, ${company || null}, ${status}, ${budget || null}, ${deadline || null}, ${cost || null}, ${notes || null})
      RETURNING *
    `;

    return jsonResponse(result[0], 201);
  } catch (error) {
    console.error("Error creating client:", error);
    return errorResponse("Failed to create client", 500);
  }
}

// PUT /api/admin/clients - update client
async function updateClient(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const body = await context.request.json();
    const { id, name, email, phone, company, status, budget, deadline, cost, notes } = body;

    if (!id) {
      return errorResponse("Client ID is required", 400);
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: unknown[] = [];
    const fields = ["name", "email", "phone", "company", "status", "budget", "deadline", "cost", "notes"];
    let paramIndex = 1;

    for (const field of fields) {
      if (field in body && field !== "id") {
        updates.push(`${field} = $${paramIndex}`);
        values.push(body[field] || null);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return errorResponse("No fields to update", 400);
    }

    values.push(id);
    const query = `UPDATE clients SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const result = await sql(query, values);

    if (result.length === 0) {
      return errorResponse("Client not found", 404);
    }

    return jsonResponse(result[0]);
  } catch (error) {
    console.error("Error updating client:", error);
    return errorResponse("Failed to update client", 500);
  }
}

// DELETE /api/admin/clients - delete client
async function deleteClient(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const body = await context.request.json();
    const { id } = body;

    if (!id) {
      return errorResponse("Client ID is required", 400);
    }

    const result = await sql`
      DELETE FROM clients WHERE id = ${parseInt(id)}
      RETURNING *
    `;

    if (result.length === 0) {
      return errorResponse("Client not found", 404);
    }

    return jsonResponse({ success: true, message: "Client deleted", client: result[0] });
  } catch (error) {
    console.error("Error deleting client:", error);
    return errorResponse("Failed to delete client", 500);
  }
}

// GET /api/admin/inquiries - list all inquiries
async function getInquiries(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const inquiries = await sql`
      SELECT
        inquiries.*,
        clients.name as client_name
      FROM inquiries
      LEFT JOIN clients ON inquiries.client_id = clients.id
      ORDER BY inquiries.created_at DESC
    `;
    return jsonResponse({ inquiries });
  } catch (error) {
    console.error("Error fetching inquiries:", error);
    return errorResponse("Failed to fetch inquiries", 500);
  }
}

// POST /api/admin/inquiries/link - link inquiry to client
async function linkInquiry(
  context: Context,
  sql: ReturnType<typeof neon>
) {
  try {
    const body = await context.request.json();
    const { inquiry_id, client_id } = body;

    if (!inquiry_id || !client_id) {
      return errorResponse("inquiry_id and client_id are required", 400);
    }

    const result = await sql`
      UPDATE inquiries
      SET client_id = ${parseInt(client_id)}
      WHERE id = ${parseInt(inquiry_id)}
      RETURNING *
    `;

    if (result.length === 0) {
      return errorResponse("Inquiry not found", 404);
    }

    return jsonResponse({ success: true, inquiry: result[0] });
  } catch (error) {
    console.error("Error linking inquiry:", error);
    return errorResponse("Failed to link inquiry", 500);
  }
}

// Main handler
export default async function handler(context: Context) {
  // Handle CORS preflight
  if (context.request.method === "OPTIONS") {
    return handleCors();
  }

  try {
    // Initialize database connection
    const sql = neon();
    await initializeDatabase(sql);

    const url = new URL(context.request.url);
    const pathname = url.pathname;

    // OTP routes (no auth required)
    if (context.request.method === "POST") {
      if (pathname.match(/\/api\/admin\/otp\/send$/)) {
        return await sendOTP(context, sql);
      }
      if (pathname.match(/\/api\/admin\/otp\/verify$/)) {
        return await verifyOTP(context, sql);
      }
      if (pathname.match(/\/api\/admin\/otp\/logout$/)) {
        return await logout(context, sql);
      }
    }

    // All other routes require authentication
    if (!(await checkAuth(context, sql))) {
      return errorResponse("Unauthorized", 401);
    }

    // GET routes
    if (context.request.method === "GET") {
      if (pathname.match(/\/api\/admin\/clients$/)) {
        return await getClients(context, sql);
      }
      if (pathname.match(/\/api\/admin\/inquiries$/)) {
        return await getInquiries(context, sql);
      }
    }

    // POST routes
    if (context.request.method === "POST") {
      if (pathname.match(/\/api\/admin\/clients$/)) {
        return await createClient(context, sql);
      }
      if (pathname.match(/\/api\/admin\/inquiries\/link$/)) {
        return await linkInquiry(context, sql);
      }
    }

    // PUT routes
    if (context.request.method === "PUT") {
      if (pathname.match(/\/api\/admin\/clients$/)) {
        return await updateClient(context, sql);
      }
    }

    // DELETE routes
    if (context.request.method === "DELETE") {
      if (pathname.match(/\/api\/admin\/clients$/)) {
        return await deleteClient(context, sql);
      }
    }

    return errorResponse("Not found", 404);
  } catch (error) {
    console.error("Unhandled error:", error);
    return errorResponse("Internal server error", 500);
  }
}

// Export config for path-based routing
export const config: Config = {
  path: "/api/admin/*",
};
