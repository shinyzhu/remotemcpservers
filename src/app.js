import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

export const createApp = () => {
  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(express.json({ limit: '1mb' }));

  const handleMcpRequest = async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json(INTERNAL_SERVER_ERROR);
      }
    } finally {
      // Clean up after response is sent
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
  };

  app.get('/', (_req, res) => {
    res.type('html').send(homePageHtml);
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/', handleMcpRequest);
  app.post('/mcp', handleMcpRequest);
  app.post('/messages', handleMcpRequest);

  app.get('/mcp', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  app.get('/messages', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  app.delete('/messages', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  return app;
};
