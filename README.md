# remotemcpservers

Lightweight remote MCP server with two deployment targets:

| Target | Entry point | Transport |
|---|---|---|
| **Node.js** (local dev) | `src/index.js` | Express + `StreamableHTTPServerTransport` |
| **Cloudflare Workers** | `src/worker.js` | `WebStandardStreamableHTTPServerTransport` |

Shared MCP logic lives in `src/mcpServer.js` and is used by both targets.

## Included tools

| Tool | Description |
|---|---|
| `current_date_time` | Returns the current date and time in ISO 8601 and localized formats. |
| `http_get` | Performs an HTTP GET request and returns a safe preview of the response body. |

## Run locally (Node.js)

```bash
npm install
npm start
```

Endpoints:

- `POST /mcp` — MCP Streamable HTTP endpoint
- `POST /messages` — alias for `/mcp`
- `POST /` — alias for `/mcp`
- `GET /health` — health check
- `GET /` — landing page

## Deploy to Cloudflare Workers

```bash
npm install
npm run deploy:cloudflare
```

The Wrangler configuration is in `wrangler.toml`. The worker uses
`WebStandardStreamableHTTPServerTransport` (pure Web-standard `Request`/`Response`
APIs) so it runs natively on the Cloudflare Workers runtime without Node.js shims.

## Endpoint behavior (Worker)

The Worker runs **stateless**: every `POST` is a self-contained JSON-RPC call.

| Method | Path | Response |
|---|---|---|
| `POST` | `/mcp`, `/messages`, `/` | MCP JSON-RPC over Streamable HTTP |
| `GET` | `/mcp`, `/messages` | `405` — a stateless server offers no SSE stream |
| `DELETE` | `/mcp`, `/messages` | `405` — a stateless server has no sessions to terminate |
| `OPTIONS` | any | `204` CORS preflight |
| `GET` | `/health` | `{"status":"ok"}` |
| `GET` | `/` | landing page |

Two details matter for clients being able to list tools:

1. **JSON responses.** The transport is created with `enableJsonResponse: true`,
   so each JSON-RPC POST is buffered into a single `application/json` document.
   In the default SSE mode `handleRequest()` resolves as soon as the (still
   empty) stream is handed back, and closing the transport would truncate the
   stream before the tool result was written — clients received an empty `200`
   response and reported no tools. Both response shapes are allowed by the MCP
   Streamable HTTP spec.
2. **CORS.** Permissive CORS headers plus an `OPTIONS` handler let browser-based
   MCP clients (for example the MCP Inspector web UI) reach the endpoint.

## Verify a deployment

```bash
curl -s https://<your-worker>.workers.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

The response must be `application/json` and contain `result.tools` with
`current_date_time` and `http_get`. An empty `text/event-stream` body means the
deployed Worker is still running an older build — redeploy it.

## Development

```bash
# Run unit tests (includes Worker request-lifecycle regression tests)
npm test
```
