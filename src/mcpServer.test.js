import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { createApp } from './app.js';
import { createLoggedToolHandler, currentDateTimeHandler, httpGetHandler } from './mcpServer.js';

test('currentDateTimeHandler returns structured time output', async () => {
  const result = await currentDateTimeHandler();

  assert.equal(result.content[0].type, 'text');
  const payload = JSON.parse(result.content[0].text);

  assert.match(payload.iso, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof payload.locale, 'string');
  assert.equal(typeof payload.timeZone, 'string');
});

test('httpGetHandler fetches URL and truncates long response body', async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hello world');
  });

  server.listen(0);
  await once(server, 'listening');

  try {
    const { port } = server.address();
    const result = await httpGetHandler({
      url: `http://127.0.0.1:${port}`,
      maxChars: 5,
    });

    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.bodyPreview, 'hello');
    assert.equal(payload.truncated, true);
  } finally {
    server.close();
  }
});

test('httpGetHandler rejects malformed and non-http URL schemes', async () => {
  await assert.rejects(
    () => httpGetHandler({ url: 'not a valid url' }),
    /Invalid URL: not a valid url/,
  );

  await assert.rejects(
    () => httpGetHandler({ url: 'file:///tmp/test.txt' }),
    /Only http and https URLs are supported/,
  );
});

test('createApp serves a landing page with tool and connection details', async () => {
  const app = createApp();

  const response = await request(app).get('/');

  assert.equal(response.status, 200);
  assert.match(response.text, /Remote MCP Servers/i);
  assert.match(response.text, /current_date_time/i);
  assert.match(response.text, /http_get/i);
  assert.match(response.text, /POST \/mcp/i);
  assert.match(response.text, /connect/i);
});

test('createApp accepts root and messages endpoint aliases for MCP clients', async () => {
  const app = createApp();

  const rootResponse = await request(app)
    .post('/')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

  const messagesResponse = await request(app)
    .post('/messages')
    .send({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

  assert.notEqual(rootResponse.status, 404);
  assert.notEqual(messagesResponse.status, 404);
});

test('createLoggedToolHandler logs tool call lifecycle for success', async (t) => {
  const logs = [];
  t.mock.method(console, 'log', (message) => logs.push(message));
  t.mock.method(console, 'error', () => {});

  const wrapped = createLoggedToolHandler('test_tool', async () => ({ content: [] }));
  const result = await wrapped({});

  assert.deepEqual(result, { content: [] });
  assert.equal(logs[0], '[mcp] tool call started: test_tool');
  assert.match(logs[1], /^\[mcp\] tool call succeeded: test_tool \(\d+ms\)$/);
});

test('createLoggedToolHandler logs tool call lifecycle for errors', async (t) => {
  const errors = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', (message) => errors.push(message));

  const wrapped = createLoggedToolHandler('failing_tool', async () => {
    throw new Error('boom');
  });

  await assert.rejects(() => wrapped({}), /boom/);
  assert.match(errors[0], /^\[mcp\] tool call failed: failing_tool \(\d+ms\)$/);
});
