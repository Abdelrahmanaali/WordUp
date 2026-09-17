# WordUp — Cloudflare build

A premium 2-player word game using Cloudflare Workers, Durable Objects WebSockets and D1.

Included: responsive premium UI, Play Online / Play with Friends, Create Room / Join Room, room codes and links, nickname-only play, Daily Word, Custom Word, 1/1.5/2/3/5 minute timers, both-ready start, 3 no-penalty hints, server-side scoring, result/reveal after game end, and D1 game records.

Daily mode is intentionally free and deterministic: a built-in curated 5-letter word + hint list selects one word per UTC day. Add more entries to `DAILY_WORDS` in `src/index.js` for a larger pool.

## Deploy
1. `npm install`
2. `npx wrangler d1 create wordup-db`
3. Put the returned database_id into `wrangler.jsonc`.
4. `npx wrangler d1 migrations apply WORDUP_DB --remote`
5. `npx wrangler deploy`

The Worker name must remain `wordup` to match the Cloudflare project. GitHub auto-deploy is configured from Cloudflare Workers & Pages → wordup → Settings → Builds.
