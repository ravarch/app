export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// Only handle requests starting with /api/
		if (url.pathname.startsWith('/api/')) {
			switch (url.pathname) {
				case '/api/message':
					return new Response('Hello from Workers API!');
				case '/api/random':
					return new Response(crypto.randomUUID());
				default:
					return new Response('API Endpoint Not Found', { status: 404 });
			}
		}

		// For non-API requests, we return 404 here.
		// The 'assets' binding with 'not_found_handling: single-page-application'
		// will automatically catch this 404 (if no asset matches) and serve index.html.
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
