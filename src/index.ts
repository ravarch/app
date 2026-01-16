import { WorkerEntrypoint } from "cloudflare:workers";
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

// --- CONFIG ---
const JWT_SECRET = "1e86f6cbd4757dc05b993f72d62e5777";
const DOMAIN = "drkingbd.cc";

// --- TYPES ---
interface Env {
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
  MAIL_STORAGE: R2Bucket;
  QUEUE: Queue;
  DLQ: Queue;
  USAGE_ANALYTICS: AnalyticsEngineDataset;
  EMAIL_SENDER: SendEmail;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', cors({ origin: '*' }));

// --- MIDDLEWARE ---
async function auth(c: any, next: any) {
  const token = c.req.header('Authorization')?.split(' ')[1];
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verify(token, JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch { return c.json({ error: 'Invalid Token' }, 401); }
}

// --- API ROUTES ---

// 1. Auth
app.post('/api/auth/register', async (c) => {
  const { username, password } = await c.req.json();
  const id = crypto.randomUUID();
  // Simulating Hash (Use bcrypt in prod)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hexHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  try {
    await c.env.DB.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').bind(id, username, hexHash, Date.now()).run();
    await c.env.DB.prepare('INSERT INTO aliases VALUES (?, ?, ?)').bind(`${username}@${DOMAIN}`, id, username).run();
    return c.json({ success: true });
  } catch { return c.json({ error: "Username taken" }, 409); }
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hexHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').bind(username, hexHash).first();
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  // @ts-ignore
  const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now()/1000)+86400 }, JWT_SECRET);
  // @ts-ignore
  return c.json({ token, user: { id: user.id, username: user.username } });
});

// 2. Analytics Dashboard
app.get('/api/usage', auth, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  // Aggregating from D1 for real-time view
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_emails,
      SUM(CASE WHEN category = 'Spam' THEN 1 ELSE 0 END) as spam_blocked,
      SUM(CASE WHEN scheduled_emails.id IS NOT NULL THEN 1 ELSE 0 END) as scheduled_count
    FROM emails 
    LEFT JOIN scheduled_emails ON scheduled_emails.user_id = emails.user_id
    WHERE emails.user_id = ?
  `).bind(userId).first();
  return c.json(stats);
});

// 3. Mailbox Operations
app.get('/api/emails', auth, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { results } = await c.env.DB.prepare('SELECT * FROM emails WHERE user_id = ? ORDER BY received_at DESC LIMIT 50').bind(userId).all();
  return c.json(results);
});

app.get('/api/aliases', auth, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { results } = await c.env.DB.prepare('SELECT * FROM aliases WHERE user_id = ?').bind(userId).all();
  return c.json(results);
});

app.post('/api/send', auth, async (c) => {
  // @ts-ignore
  const userId = c.get('user').id;
  const { from, to, subject, body, scheduleTime } = await c.req.json();
  
  // Verify Ownership
  const alias = await c.env.DB.prepare('SELECT * FROM aliases WHERE address = ? AND user_id = ?').bind(from, userId).first();
  if (!alias) return c.json({ error: "Unauthorized sender address" }, 403);

  if (scheduleTime) {
    await c.env.DB.prepare('INSERT INTO scheduled_emails VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, from, to, subject, body, new Date(scheduleTime).getTime(), 'pending').run();
    return c.json({ status: 'scheduled' });
  }

  // Send Immediately
  const msg = createMimeMessage();
  msg.setSender({ name: 'RavArch User', addr: from });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/html', data: body });

  try {
    // @ts-ignore
    await c.env.EMAIL_SENDER.send(new Request('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST', headers: { 'content-type': 'message/rfc822' }, body: msg.asRaw()
    }));
    return c.json({ status: 'sent' });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// --- WORKER HANDLERS ---
export default {
  fetch: app.fetch,

  // 1. INGESTION (SMTP)
  async email(message, env, ctx) {
    const id = crypto.randomUUID();
    const alias = await env.DB.prepare('SELECT user_id FROM aliases WHERE address = ?').bind(message.to).first();
    if (!alias) { message.setReject("Unknown User"); return; }

    const rawBuffer = await new Response(message.raw).arrayBuffer();
    await env.MAIL_STORAGE.put(`raw/${id}`, rawBuffer);

    // Analytics: Ingestion Event
    env.USAGE_ANALYTICS.writeDataPoint({
      blobs: ["ingest", alias.user_id as string],
      doubles: [rawBuffer.byteLength]
    });

    await env.QUEUE.send({ 
      id, userId: alias.user_id, to: message.to, from: message.from, 
      raw: btoa(String.fromCharCode(...new Uint8Array(rawBuffer))) 
    });
  },

  // 2. PROCESSING (Queue)
  async queue(batch, env) {
    // DLQ Handler
    if (batch.queue === 'mail-dlq') {
      console.error(`DLQ Received ${batch.messages.length} failed messages.`);
      return;
    }

    // Main Processor
    const results = await Promise.allSettled(batch.messages.map(async (msg) => {
      const job = msg.body as any;
      const start = Date.now();

      try {
        const parser = new PostalMime();
        const parsed = await parser.parse(atob(job.raw));
        const text = (parsed.text || parsed.html || "").slice(0, 4000);

        // AI Logic
        let aiData: any = { category: 'Inbox', sentiment: 0 };
        try {
          const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [{ role: 'user', content: `Summarize & Categorize JSON: Subject: ${parsed.subject}\n${text}` }],
            response_format: { type: 'json_object' }
          });
          // @ts-ignore
          aiData = JSON.parse(aiRes.response);
        } catch {}

        // DB Save
        await env.DB.prepare(`
          INSERT INTO emails (id, user_id, sender_address, subject, summary, category, sentiment_score, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(job.id, job.userId, parsed.from.address, parsed.subject, aiData.summary, aiData.category, aiData.sentiment, Date.now()).run();

        // Analytics: Processing Event
        env.USAGE_ANALYTICS.writeDataPoint({
          blobs: ["process", job.userId, aiData.category],
          doubles: [Date.now() - start, 1]
        });

        msg.ack();
      } catch (e) {
        console.error("Msg Fail", e);
        msg.retry(); // Triggers exponential backoff configured in wrangler.jsonc
      }
    }));
  },

  // 3. SCHEDULING (Cron)
  async scheduled(event, env, ctx) {
    const now = Date.now();
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_emails WHERE status = 'pending' AND scheduled_for <= ?").bind(now).all();
    
    for (const task of results) {
      try {
        const msg = createMimeMessage();
        msg.setSender({ name: 'Scheduled', addr: task.from_address as string });
        msg.setRecipient(task.to_address as string);
        msg.setSubject(task.subject as string);
        msg.addMessage({ contentType: 'text/html', data: task.body_html as string });

        // @ts-ignore
        await env.EMAIL_SENDER.send(new Request('https://api.mailchannels.net/tx/v1/send', {
          method: 'POST', headers: { 'content-type': 'message/rfc822' }, body: msg.asRaw()
        }));

        await env.DB.prepare("UPDATE scheduled_emails SET status = 'sent' WHERE id = ?").bind(task.id).run();
      } catch {
        await env.DB.prepare("UPDATE scheduled_emails SET status = 'failed' WHERE id = ?").bind(task.id).run();
      }
    }
  }
} satisfies ExportedHandler<Env>;
