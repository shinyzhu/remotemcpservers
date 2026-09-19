import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './mcpServer.js';

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
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

const REQUEST_TIMEOUT_MS = 25_000; // Cloudflare Workers have 30s limit

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const isMcpEndpoint = ['/', '/mcp', '/messages'].includes(url.pathname);

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        `<!doctype html><html><body><h1>Remote MCP Servers</h1><p>Use POST /mcp or POST /messages for MCP requests.</p></body></html>`,
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }

    if (!isMcpEndpoint) {
      return new Response('Not Found', { status: 404 });
    }

    if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
      return jsonResponse(METHOD_NOT_ALLOWED, 405);
    }

    // Wrap in timeout to prevent Worker from hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT_MS),
    );

    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);

      // Clone request if needed for body reading
      const clonedRequest = request.clone?.() || request;
      const response = await Promise.race([
        transport.handleRequest(clonedRequest),
        timeoutPromise,
      ]);

      return response;
    } catch (error) {
      console.error('Error handling MCP request:', error.message || error);
      return jsonResponse(INTERNAL_SERVER_ERROR, 500);
    } finally {
      try {
        transport.close();
        await server.close();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
  },
};
