import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { currentDateTimeHandler, httpGetHandler } from './mcpServer.js';

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

test('httpGetHandler rejects non-http URL schemes', async () => {
  await assert.rejects(
    () => httpGetHandler({ url: 'file:///tmp/test.txt' }),
    /Only http and https URLs are supported/,
  );
});
