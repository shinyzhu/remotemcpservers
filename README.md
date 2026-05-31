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

## Deploy to Cloudflare

This server is stateless and only requires `npm install` + `npm start`, which makes it straightforward to deploy behind Cloudflare (for example on a VM/container fronted by Cloudflare Tunnel or Cloudflare proxy).
