# Rustdesk serverless server

<!-- dash-content-start -->

This is a rustdesk HBBS/HBBR websocket implement with [Durable Object](https://developers.cloudflare.com/durable-objects/)

Setup worker secret HBBS_RELAY_URL = 'wss://your-worker-url' on cloudflare dashboard

Enable 'Use Websocket' on rustdesk Network setting, set ID/Relay Server to your-worker-url,

Set Api Server to https://localhost or https://your-worker-url to enable wss connection

Goto https://rustdesk.com/web/ set Network setting to your-worker-url, control your desk by web

## Optional: verified end-to-end encryption (native clients)
 
Without this step the native client shows "Could not verify end-to-end encryption" on every
connection. To get a verified session, give the worker its own Ed25519 key pair:
 
1. **Create the key pair** (needs Node.js). Run this in the repo folder after `pnpm install`,
   or in any empty folder after `npm install tweetnacl`:
```bash
   node -e "const n=require('tweetnacl');const k=n.sign.keyPair();console.log('PUBLIC (client Key field):');console.log(Buffer.from(k.publicKey).toString('base64'));console.log('SECRET (worker secret HBBS_SIGN_SK):');console.log(Buffer.from(k.secretKey).toString('base64'))"
```
 
   It prints a **PUBLIC** key (44 characters) and a **SECRET** key (88 characters). The two belong together.
 
2. **Store the SECRET key on the worker:** Cloudflare dashboard, Compute (Workers & Pages), your worker,
   Settings, Variables and Secrets, Add. Type `Secret`, name `HBBS_SIGN_SK`, value is the secret key.
   Save and deploy.
3. **Store the PUBLIC key in every controlling RustDesk client:** Settings, Network, ID/Relay server,
   field **Key** (next to ID server, Relay server and API server). Paste it without spaces or line
   breaks, confirm and restart RustDesk.
If `HBBS_SIGN_SK` is not set, behaviour is unchanged. To replace the key pair later, repeat all three
steps with a new pair; an old public key in a client no longer matches. Keep the secret private:
anyone holding it can impersonate your server towards clients that have the matching public key.


[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lichon/hbbs-worker)

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

