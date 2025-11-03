# Durable Objects Starter

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lichon/hbbs-worker)

<!-- dash-content-start -->

This is a rustdesk HBBS/HBBR websocket implement with [Durable Object](https://developers.cloudflare.com/durable-objects/)

<!-- dash-content-end -->

## Getting Started

First, run:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

Then run the development server (using the package manager of your choice):

```bash
npm run dev
```
## Deploying To Production

| Command             | Action                                |
| :------------------ | :------------------------------------ |
| `npm run deploy`    | Deploy your application to Cloudflare |
| `npm wrangler tail` | View real-time logs for all Workers   |

Setup worker secret HBBS_RELAY_URL = 'wss://your-worker-url' on cloudflare dashboard

Enable Use Websocket on rustdesk Network setting, set ID/Relay Server to your-worker-url,
Set Api Server to https://localhost to enable wss connection
