const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL;
  const FROM_EMAIL = process.env.FROM_EMAIL || "Scale Rebel Studio <noreply@thescalerebel.com>";

  if (!RESEND_API_KEY || !CONTACT_EMAIL) {
    return json(500, { error: "Server is missing required configuration." });
  }

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Invalid JSON." }); }

  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  if (!name) return json(400, { error: "Name is required." });
  if (!isEmail(email)) return json(400, { error: "Valid email is required." });

  const fields = [
    ["Name", name],
    ["Email", email],
    ["Business / Project", payload.business],
    ["Type", payload.type],
    ["Timeline", payload.timeline],
    ["Inspiration", payload.inspo],
    ["Budget", payload.budget],
    ["Domain", payload.domain],
    ["Content readiness", payload.content],
    ["Pages", payload.pages],
    ["Inspo #1", payload.inspo1],
    ["Inspo #2", payload.inspo2],
    ["Inspo #3", payload.inspo3],
    ["Notes", payload.message],
  ].filter(([,v]) => String(v || "").trim().length);

  const text = fields.map(([k,v]) => `${k}: ${String(v).trim()}`).join("\n");

  const subject = `New inquiry — ${name}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: CONTACT_EMAIL,
      reply_to: email,
      subject,
      text
    })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    console.error("Resend error:", res.status, msg);
    return json(502, { error: "Email service error. Please try again." });
  }

  return json(200, { ok: true });
}
