# remotemcpservers

Node + Express based remote MCP server with Streamable HTTP transport.

## Included tools

- `current_date_time`: returns current date/time in ISO + localized format.
- `http_get`: performs HTTP GET requests and returns a safe response preview.

## Run locally

```bash
npm install
npm start
```

Server endpoints:

- `POST /mcp` - MCP Streamable HTTP endpoint
- `GET /health` - health check

## Deploy to Cloudflare Workers

This repository includes a Worker entrypoint at `src/worker.js` and Wrangler config in `wrangler.toml`.

```bash
npm install
npm run deploy:cloudflare
```

This avoids Cloudflare static-site auto detection and deploys as a Worker service.
