import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer, homePageHtml } from './mcpServer.js';

const METHOD_NOT_ALLOWED = {
  jsonrpc: '2.0',
  error: {
    code: -32000,
    message: 'Method not allowed.',
  },
  id: null,
};

const INTERNAL_SERVER_ERROR = {
  jsonrpc: '2.0',
  error: {
    code: -32603,
    message: 'Internal server error',
  },
  id: null,
};

// MCP endpoints. `/` is an alias handled separately so GET / can serve the
// landing page.
const MCP_PATHS = new Set(['/mcp', '/messages']);

const ALLOWED_METHODS = 'POST, OPTIONS';

// CORS makes the endpoint usable from browser-based MCP clients (for example
// the MCP Inspector web UI), which otherwise fail at the preflight stage.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
  'access-control-max-age': '86400',
};

const withCors = (response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const jsonResponse = (body, status = 200, extraHeaders = {}) =>
  withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...extraHeaders,
      },
    }),
  );

// Cloudflare Workers have a 30 s CPU-time limit; leave a 5 s margin.
const REQUEST_TIMEOUT_MS = 25_000;

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    // CORS preflight.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' });
    }

    if (pathname === '/' && request.method === 'GET') {
      return withCors(
        new Response(homePageHtml, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    }

    const isMcpRoot = pathname === '/';
    const isMcpPath = MCP_PATHS.has(pathname);

    if (!isMcpRoot && !isMcpPath) {
      return withCors(new Response('Not Found', { status: 404 }));
    }

    // This server is stateless: every POST is a self-contained JSON-RPC call.
    // There is no session to DELETE and no server-initiated SSE stream to open
    // with GET, so both must answer 405 (MCP Streamable HTTP transport spec);
    // the official client treats that 405 as "no SSE stream offered".
    if (request.method !== 'POST') {
      return jsonResponse(METHOD_NOT_ALLOWED, 405, { allow: ALLOWED_METHODS });
    }

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Request timed out')),
        REQUEST_TIMEOUT_MS,
      );
    });

    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      // Buffer each JSON-RPC response into a single JSON document instead of an
      // SSE stream. In the default streaming mode `handleRequest()` resolves as
      // soon as the (still empty) stream is handed back, so the cleanup below
      // would close the stream before the tool result is written. Clients then
      // received an empty 200 response and reported an empty tool list.
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);

      const handleRequestPromise = transport.handleRequest(request);
      // If the timeout wins the race, nothing awaits the transport promise any
      // more; make sure a later rejection cannot become an unhandled rejection.
      handleRequestPromise.catch(() => {});

      const response = await Promise.race([
        handleRequestPromise,
        timeoutPromise,
      ]);

      return withCors(response);
    } catch (error) {
      console.error('MCP request error:', error?.message ?? error);
      return jsonResponse(INTERNAL_SERVER_ERROR, 500);
    } finally {
      clearTimeout(timeoutId);
      // Safe now: with enableJsonResponse the returned body is already fully
      // materialized, so closing the transport no longer truncates it.
      try {
        await transport.close();
      } catch { /* ignore */ }
      try {
        await server.close();
      } catch { /* ignore */ }
    }
  },
};
