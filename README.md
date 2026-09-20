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

## Development

```bash
# Run unit tests
npm test
```
