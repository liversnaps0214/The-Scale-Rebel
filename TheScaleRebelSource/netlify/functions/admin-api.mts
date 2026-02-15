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
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

// Password authentication middleware
function checkAuth(context: Context): boolean {
  const authHeader = context.request.headers.get("Authorization");
  const adminPassword = Netlify.env.get("ADMIN_PASSWORD");

  if (!adminPassword) {
    console.warn("ADMIN_PASSWORD not configured");
    return false;
  }

  return authHeader === adminPassword;
}

// JSON response helper
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

      return jsonResponse({ ...client, inquiries });
    } else {
      // Get all clients
      const clients = await sql`
        SELECT * FROM clients ORDER BY updated_at DESC
      `;
      return jsonResponse(clients);
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

    const result = await sql.query(query, values);

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

    return jsonResponse({ message: "Client deleted", client: result[0] });
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
    return jsonResponse(inquiries);
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
    const { inquiryId, clientId } = body;

    if (!inquiryId || !clientId) {
      return errorResponse("inquiryId and clientId are required", 400);
    }

    const result = await sql`
      UPDATE inquiries
      SET client_id = ${parseInt(clientId)}
      WHERE id = ${parseInt(inquiryId)}
      RETURNING *
    `;

    if (result.length === 0) {
      return errorResponse("Inquiry not found", 404);
    }

    return jsonResponse(result[0]);
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

  // Check authentication
  if (!checkAuth(context)) {
    return errorResponse("Unauthorized", 401);
  }

  // Initialize database
  const sql = neon();
  await initializeDatabase(sql);

  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Route handling
  try {
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
