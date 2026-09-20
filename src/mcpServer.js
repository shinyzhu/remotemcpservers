import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const homePageHtml = `<!doctype html>
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

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CHARS = 5_000;

export const createLoggedToolHandler = (toolName, handler) => async (args = {}) => {
  const startedAt = Date.now();
  console.log(`[mcp] tool call started: ${toolName}`);

  try {
    const result = await handler(args);
    const durationMs = Date.now() - startedAt;
    console.log(`[mcp] tool call succeeded: ${toolName} (${durationMs}ms)`);
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[mcp] tool call failed: ${toolName} (${durationMs}ms)`, error);
    throw error;
  }
};

export const currentDateTimeHandler = async ({ timeZone } = {}) => {
  const now = new Date();
  const resolvedTimeZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: resolvedTimeZone,
  }).format(now);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            iso: now.toISOString(),
            locale,
            timeZone: resolvedTimeZone,
          },
          null,
          2,
        ),
      },
    ],
  };
};

export const parseHttpUrl = (url) => {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('A valid URL string is required.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  return parsedUrl;
};

export const httpGetHandler = async ({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxChars = DEFAULT_MAX_CHARS,
}) => {
  const parsedUrl = parseHttpUrl(url);

  let response;
  try {
    response = await fetch(parsedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'remotemcpservers/1.0',
        accept: '*/*',
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch ${parsedUrl.toString()}: ${error.message}`);
  }

  const body = await response.text();
  const truncated = body.length > maxChars;
  const preview = body.slice(0, maxChars);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            url: parsedUrl.toString(),
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            bodyPreview: preview,
            truncated,
          },
          null,
          2,
        ),
      },
    ],
  };
};

export const createMcpServer = () => {
  const server = new McpServer(
    {
      name: 'remotemcpservers',
      version: '1.0.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  server.registerTool(
    'current_date_time',
    {
      description: 'Get the current date and time in ISO and localized formats.',
      inputSchema: z.object({
        timeZone: z.string().optional().describe('Optional IANA timezone, e.g. Asia/Shanghai'),
      }),
    },
    createLoggedToolHandler('current_date_time', currentDateTimeHandler),
  );

  server.registerTool(
    'http_get',
    {
      description: 'Fetch a URL with HTTP GET and return a preview of the response body.',
      inputSchema: z.object({
        url: z.string().url().describe('Target URL to fetch over HTTP or HTTPS.'),
        timeoutMs: z.number().int().min(1_000).max(30_000).default(DEFAULT_TIMEOUT_MS),
        maxChars: z.number().int().min(1).max(20_000).default(DEFAULT_MAX_CHARS),
      }),
    },
    createLoggedToolHandler('http_get', httpGetHandler),
  );

  return server;
};
