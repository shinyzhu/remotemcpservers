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

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200);
    }

    if (url.pathname !== '/mcp') {
      return new Response('Not Found', { status: 404 });
    }

    if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
      return jsonResponse(METHOD_NOT_ALLOWED, 405);
    }

    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      return jsonResponse(INTERNAL_SERVER_ERROR, 500);
    } finally {
      transport.close();
      await server.close();
    }
  },
};
