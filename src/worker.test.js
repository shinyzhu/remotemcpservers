import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from './worker.js';

// Minimal Node HTTP -> Web Standard adapter so the Worker's `fetch` handler can
// be exercised exactly as Cloudflare invokes it.
const startWorkerServer = async () => {
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const request = new Request(
        `http://127.0.0.1:${server.address().port}${req.url}`,
        {
          method: req.method,
          headers: req.headers,
          body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        },
      );

      const response = await worker.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));

      if (response.body) {
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      }

      res.end();
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });

  server.listen(0);
  await once(server, 'listening');

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const postJsonRpc = (baseUrl, path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'worker-test', version: '1.0.0' },
  },
};

test('worker lets an MCP client list both tools', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    const client = new Client({ name: 'worker-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
    );

    await client.connect(transport);

    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      ['current_date_time', 'http_get'],
    );

    await client.close();
  } finally {
    await close();
  }
});

// Regression test: the transport used to be closed inside `finally` before the
// streaming response was written, so clients received an empty 200 body.
test('worker returns a complete JSON-RPC tools/list payload', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    const response = await postJsonRpc(baseUrl, '/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);

    const body = await response.json();

    assert.equal(body.jsonrpc, '2.0');
    assert.equal(body.id, 2);
    assert.deepEqual(
      body.result.tools.map((tool) => tool.name).sort(),
      ['current_date_time', 'http_get'],
    );
  } finally {
    await close();
  }
});

test('worker accepts initialize on the /messages alias', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    const response = await postJsonRpc(baseUrl, '/messages', INITIALIZE);

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.result.serverInfo.name, 'remotemcpservers');
    assert.equal(body.result.protocolVersion, '2025-06-18');
  } finally {
    await close();
  }
});

test('worker rejects GET and DELETE on MCP endpoints with 405', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    for (const path of ['/mcp', '/messages']) {
      for (const method of ['GET', 'DELETE']) {
        const response = await fetch(`${baseUrl}${path}`, { method });

        assert.equal(response.status, 405, `${method} ${path}`);
        assert.equal(response.headers.get('allow'), 'POST, OPTIONS');

        const body = await response.json();
        assert.equal(body.error.code, -32000);
      }
    }
  } finally {
    await close();
  }
});

test('worker answers CORS preflight with the MCP headers', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    const response = await fetch(`${baseUrl}/mcp`, { method: 'OPTIONS' });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(
      response.headers.get('access-control-allow-headers'),
      /mcp-session-id/i,
    );
  } finally {
    await close();
  }
});

test('worker serves health check and landing page', async () => {
  const { baseUrl, close } = await startWorkerServer();

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Remote MCP Servers/i);

    const missing = await fetch(`${baseUrl}/nope`);
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});
