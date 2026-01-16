import { WorkerEntrypoint } from "cloudflare:workers";
import PostalMime from 'postal-mime';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  DB: D1Database;
  AI: Ai;
  EMAIL_SENDER: SendEmail; // Binding for sending
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors());

// --- 1. API ROUTES (Frontend Communication) ---

// Get Inbox
app.get('/api/emails', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_name, sender_address, subject, summary, category, sentiment_score, received_at, is_read 
     FROM emails WHERE is_archived = 0 ORDER BY received_at DESC LIMIT 50`
  ).all();
  return c.json(results);
});

// Get Single Email
app.get('/api/emails/:id', async (c) => {
  const id = c.req.param('id');
  const email = await c.env.DB.prepare('SELECT * FROM emails WHERE id = ?').bind(id).first();
  
  // Mark as read
  await c.env.DB.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').bind(id).run();
  
  return c.json(email);
});

// Send Email (Outbound)
app.post('/api/send', async (c) => {
  const { to, subject, body } = await c.req.json();
  
  try {
    // Requires "Email Sending" enabled in Cloudflare Dashboard
    await c.env.EMAIL_SENDER.send({
      to: [{ email: to }],
      from: { email: "me@yourdomain.com", name: "RavArch AI" }, // Must be a verified sender
      subject: subject,
      content: [
        { type: "text/plain", value: body }
      ]
    });
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// --- 2. EMAIL HANDLER (Incoming Mail) ---

async function processEmail(message: ForwardableEmailMessage, env: Env) {
  const parser = new PostalMime();
  const rawEmail = await new Response(message.raw).arrayBuffer();
  const parsed = await parser.parse(rawEmail);

  // 1. Extract Text
  const bodyText = parsed.text || parsed.html || "";
  const cleanBody = bodyText.slice(0, 4000); // Truncate for AI context window

  // 2. AI Analysis Pipeline
  const aiPrompt = `
    Analyze this email. Return a JSON object with:
    1. "summary": A single sentence summary (max 20 words).
    2. "category": One of ["Work", "Personal", "Urgent", "Newsletter", "Spam"].
    3. "sentiment": A float between -1.0 (Negative) and 1.0 (Positive).
    4. "action_items": An array of strings describing required tasks (if any).
    5. "suggested_reply": A professional, brief draft reply.

    Email Subject: ${parsed.subject}
    Email Body: ${cleanBody}
  `;

  let aiData = { summary: "Processing...", category: "Inbox", sentiment: 0, action_items: [], suggested_reply: "" };
  
  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: aiPrompt }],
      response_format: { type: 'json_object' } // Force JSON output
    });
    
    // @ts-ignore
    aiData = JSON.parse(aiResponse.response || "{}");
  } catch (e) {
    console.error("AI Analysis failed:", e);
  }

  // 3. Store in Vault (D1)
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO emails (
      id, sender_name, sender_address, recipient_address, subject, 
      body_text, body_html, received_at, summary, category, 
      sentiment_score, action_items, suggested_reply
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, 
    parsed.from.name, 
    parsed.from.address, 
    parsed.to[0].address, 
    parsed.subject,
    parsed.text,
    parsed.html,
    Date.now(),
    aiData.summary,
    aiData.category,
    aiData.sentiment || 0,
    JSON.stringify(aiData.action_items || []),
    aiData.suggested_reply
  ).run();
}

export default {
  // HTTP Handler (API)
  fetch: app.fetch,

  // Email Handler (SMTP)
  async email(message, env, ctx) {
    await processEmail(message, env);
    // Optional: Forward to a backup address
    // await message.forward("backup@gmail.com");
  }
} satisfies ExportedHandler<Env>;
