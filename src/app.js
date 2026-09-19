import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

const homePageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Remote MCP Servers</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #0f172a;
        --panel: #111827;
        --panel-alt: #1f2937;
        --text: #e5e7eb;
        --muted: #cbd5e1;
        --accent: #7dd3fc;
        --accent-strong: #38bdf8;
        --border: rgba(148, 163, 184, 0.25);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: linear-gradient(180deg, #020817 0%, #0f172a 100%);
        color: var(--text);
        line-height: 1.6;
      }
      .container {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 20px 80px;
      }
      .hero {
        padding: 32px 24px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.7);
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2.2rem, 4vw, 4rem);
        line-height: 1.1;
      }
      .subtitle {
        margin: 0;
        color: var(--muted);
        font-size: 1.05rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-top: 28px;
      }
      .card {
        background: rgba(17, 24, 39, 0.8);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 20px;
      }
      .card h2 {
        margin-top: 0;
        font-size: 1.15rem;
      }
      .tool-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .tool-list li {
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
      }
      .tool-list li:last-child { border-bottom: none; }
      code, pre {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      }
      code {
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 6px;
      }
      pre {
        overflow-x: auto;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 14px;
        color: var(--muted);
      }
      .badge {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 9999px;
        background: rgba(56, 189, 248, 0.15);
        color: var(--accent);
        border: 1px solid rgba(56, 189, 248, 0.35);
        font-size: 0.82rem;
        margin-bottom: 14px;
      }
    </style>
  </head>
  <body>
    <main class="container">
      <section class="hero">
        <div class="badge">Remote MCP Servers</div>
        <h1>Connect custom tools to your AI workflows.</h1>
        <p class="subtitle">
          This project hosts lightweight MCP servers for local or remote clients such as HiDestina,
          giving AI assistants access to specific tools like current time lookup and safe HTTP fetches.
        </p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Available MCP tools</h2>
          <ul class="tool-list">
            <li><strong>current_date_time</strong><br />Returns the current time in ISO format and a localized human-readable form.</li>
            <li><strong>http_get</strong><br />Performs an HTTP GET request and returns a safe preview of the response body.</li>
          </ul>
        </article>

        <article class="card">
          <h2>How to connect</h2>
          <p>Use the MCP endpoint over HTTP:</p>
          <pre>POST /mcp</pre>
          <p>Health check:</p>
          <pre>GET /health</pre>
          <p>Local example:</p>
          <pre>http://localhost:3000/mcp</pre>
          <p>Cloudflare deployment example:</p>
          <pre>https://&lt;your-worker&gt;.workers.dev/mcp</pre>
        </article>
      </section>

      <section class="card" style="margin-top: 28px;">
        <h2>Example connection flow</h2>
        <pre>1. Start the server
   npm install
   npm start

2. Connect your MCP client to:
   http://localhost:3000/mcp

3. Send MCP JSON-RPC requests over POST /mcp
   to invoke current_date_time or http_get</pre>
      </section>
    </main>
  </body>
</html>`;

export const createApp = () => {
  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.type('html').send(homePageHtml);
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/mcp', async (req, res) => {
    const server = createMcpServer();

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json(INTERNAL_SERVER_ERROR);
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  app.delete('/mcp', (_req, res) => {
    res.status(405).json(METHOD_NOT_ALLOWED);
  });

  return app;
};
