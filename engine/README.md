# Engine server (Stockfish) — not in use

**Not deployed.** Games are analysed by Stockfish in the players' browsers instead
(`public/engine/`, docs/PLATFORM.md §5.2), which costs nothing and needs no server. This
server stays as an option, e.g. for deeper analysis later.

It evaluates the positions of finished games so the game server can compute each player's
accuracy. It was written for an Oracle Cloud **Always Free** VM (Ampere A1, Ubuntu 24.04;
since mid-2026 the free tier is 2 OCPU / 12 GB, and A1 capacity is often unavailable), set
up entirely by `cloud-init.yaml` on the first boot:

- `server.mjs` (no dependencies) runs one Stockfish process per CPU core and answers
  `POST /analyse { fens, depth? }` with `{ evals: [{ cp, mate, best }] }` (White's view) for
  callers that send `Authorization: Bearer <ENGINE_SECRET>`; `GET /health` is public.
- Caddy serves it over HTTPS at `https://<public-ip-with-dashes>.sslip.io` (Let's Encrypt).
- A timer pulls `main` from GitHub every 15 minutes and restarts the server when `engine/`
  changed, so updates need no access to the VM.

Run it locally: `ENGINE_SECRET=<24+ chars> PORT=8787 node engine/server.mjs` (needs the
`stockfish` binary; `STOCKFISH=/path` to point at another one).

On the VM: `systemctl status wizard-engine caddy`, logs with `journalctl -u wizard-engine`,
the URL in `/root/engine-url.txt`, the secret in `/etc/wizard-engine.env`.
