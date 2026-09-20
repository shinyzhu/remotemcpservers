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

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// Cloudflare Workers have a 30 s CPU-time limit; leave a 5 s margin.
const REQUEST_TIMEOUT_MS = 25_000;

const MCP_PATHS = new Set(['/mcp', '/messages']);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' });
    }

    if (pathname === '/' && request.method === 'GET') {
      return new Response(homePageHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    // Stateless MCP: accept POST on /, /mcp, /messages.
    // For /mcp and /messages also pass GET and DELETE to the transport so it
    // can return the correct MCP error response (405 in stateless mode).
    const isMcpRoot = pathname === '/';
    const isMcpPath = MCP_PATHS.has(pathname);

    if (!isMcpRoot && !isMcpPath) {
      return new Response('Not Found', { status: 404 });
    }

    // Root alias only supports POST.
    if (isMcpRoot && request.method !== 'POST') {
      return jsonResponse(METHOD_NOT_ALLOWED, 405);
    }

    // /mcp and /messages: allow POST, GET (SSE), DELETE (session teardown);
    // the transport returns the appropriate response for each in stateless mode.
    if (isMcpPath && !['GET', 'POST', 'DELETE'].includes(request.method)) {
      return jsonResponse(METHOD_NOT_ALLOWED, 405);
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
    });

    try {
      await server.connect(transport);

      const response = await Promise.race([
        transport.handleRequest(request),
        timeoutPromise,
      ]);

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('MCP request error:', error.message ?? error);
      return jsonResponse(INTERNAL_SERVER_ERROR, 500);
    } finally {
      try { transport.close(); } catch { /* ignore */ }
      try { await server.close(); } catch { /* ignore */ }
    }
  },
};
