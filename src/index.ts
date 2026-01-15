import { WorkerEntrypoint } from "cloudflare:workers";

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // --- API ROUTES ---
    if (url.pathname.startsWith('/api/')) {
      const corsHeaders = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      };

      try {
        // 1. Mock AI Agent Chat Endpoint
        if (url.pathname === '/api/chat' && request.method === 'POST') {
          const body = await request.json() as { message: string };
          
          // Simulate AI processing delay
          await new Promise(r => setTimeout(r, 800));

          const responses = [
            "That's an interesting architectural choice. Have you considered using Durable Objects for state?",
            "I can help you optimize that. Cloudflare Workers would reduce latency significantly here.",
            "Based on your request, I recommend utilizing the KV store for high-read throughput.",
            "Agents SDK is installed. I am ready to be connected to a real LLM backend."
          ];
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];

          return new Response(JSON.stringify({ 
            response: randomResponse,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString()
          }), { headers: corsHeaders });
        }

        // 2. Real-time System Stats Endpoint
        if (url.pathname === '/api/stats') {
          // In a real app, you would fetch these from KV or D1
          return new Response(JSON.stringify({
            users_active: Math.floor(Math.random() * 1000) + 500,
            requests_processed: Math.floor(Math.random() * 1000000) + 9000000,
            latency_ms: Math.floor(Math.random() * 20) + 10,
            region: request.cf?.colo || 'Earth'
          }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: "Endpoint not found" }), { 
          status: 404, 
          headers: corsHeaders 
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: "Internal Error" }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // --- STATIC ASSETS (SPA Fallback) ---
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
