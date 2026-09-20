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
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });

const REQUEST_TIMEOUT_MS = 25_000; // Cloudflare Workers have 30s limit

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200);
    }

    // Homepage - only GET /
    if (path === '/' && request.method === 'GET') {
      return new Response(homePageHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    // MCP endpoints: GET (SSE), POST, DELETE allowed on /mcp, /messages; POST only on /
    const isMcpPostEndpoint = path === '/';
    const isMcpEndpoint = ['/mcp', '/messages'].includes(path);
    if (!isMcpEndpoint && !isMcpPostEndpoint) {
      return new Response('Not Found', { status: 404 });
    }

    if (isMcpPostEndpoint && request.method !== 'POST') {
      return jsonResponse(METHOD_NOT_ALLOWED, 405);
    }

    if (isMcpEndpoint && !['GET', 'POST', 'DELETE'].includes(request.method)) {
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

      // Clone request for safe body reading in Workers
      const clonedRequest = request.clone?.() || request;
      
      // Use Promise.race with timeout, but ensure request completes
      const response = await Promise.race([
        transport.handleRequest(clonedRequest),
        timeoutPromise,
      ]);

      return response;
    } catch (error) {
      console.error('Error handling MCP request:', error.message || error);
      return jsonResponse(INTERNAL_SERVER_ERROR, 500);
    } finally {
      // Clean up resources
      try {
        transport.close();
      } catch (closeError) {
        console.error('Error closing transport:', closeError);
      }
      try {
        await server.close();
      } catch (closeError) {
        console.error('Error closing server:', closeError);
      }
    }
  },
};
