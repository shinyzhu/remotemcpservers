import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

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

export const httpGetHandler = async ({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxChars = DEFAULT_MAX_CHARS,
}) => {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  const response = await fetch(parsedUrl, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': 'remotemcpservers/1.0',
      accept: '*/*',
    },
  });

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
      inputSchema: {
        timeZone: z.string().optional().describe('Optional IANA timezone, e.g. Asia/Shanghai'),
      },
    },
    createLoggedToolHandler('current_date_time', currentDateTimeHandler),
  );

  server.registerTool(
    'http_get',
    {
      description: 'Fetch a URL with HTTP GET and return a preview of the response body.',
      inputSchema: {
        url: z.string().url().describe('Target URL to fetch over HTTP or HTTPS.'),
        timeoutMs: z.number().int().min(1_000).max(30_000).default(DEFAULT_TIMEOUT_MS),
        maxChars: z.number().int().min(1).max(20_000).default(DEFAULT_MAX_CHARS),
      },
    },
    createLoggedToolHandler('http_get', httpGetHandler),
  );

  return server;
};
