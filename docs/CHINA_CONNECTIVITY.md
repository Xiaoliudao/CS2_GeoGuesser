# Mainland China and high-latency connectivity

CS2 Map Guesser runs on Cloudflare's global infrastructure. Cross-border routes from Mainland China can still have substantial latency, packet loss, or intermittent reachability. In particular, these application changes do **not** guarantee that a `*.workers.dev` hostname is directly reachable from Mainland China.

The multiplayer flow is designed to remain fair when players connect through high-latency routes:

- A round enters `round_preparing` before the authoritative countdown exists.
- Each browser downloads and decodes the question screenshot and critical radar assets, then reports readiness.
- The room creates one shared `roundEndsAt` only after every active player has loaded the round assets.
- RTT is diagnostic only. It never changes scores or gives players different deadlines.
- A failed or stalled asset is replaced at most twice. Repeated failure ends the match with `NETWORK_ASSET_FAILURE` and awards no free points.
- WebSocket reconnect uses bounded exponential backoff with jitter, while the existing disconnect grace period remains authoritative.

This improves accelerator, VPN-like gaming-route, mobile, and other high-latency sessions. It is not a substitute for a compliant China deployment or a reliable cross-border network path, and the project intentionally does not include proxy-bypass techniques.

## Deployment and media origins

Two public, non-secret variables keep hostnames configuration-driven:

```jsonc
{
  "vars": {
    "PUBLIC_APP_ORIGIN": "https://game.example.com",
    "PUBLIC_ASSET_ORIGIN": "https://assets.example.com"
  }
}
```

- `PUBLIC_APP_ORIGIN` is the canonical public application origin used by SEO output and the client build.
- `PUBLIC_ASSET_ORIGIN` is optional. Leave it empty to use the authenticated same-origin Worker routes under `/media/*`.
- When set, `PUBLIC_ASSET_ORIGIN` must be an HTTP(S) origin serving the R2 object-key layout directly, such as `questions/<asset-id>.webp` and `radars/<map>/<layer>.webp`. An R2 Custom Domain is the intended production use.

Only public media belongs on the asset origin. Never put R2 credentials, Cloudflare API tokens, account secrets, or D1 answer metadata in these variables. The browser receives only opaque question IDs/media paths; correct map, layer, coordinates, world position, and view angle stay server-side until the result phase.

Radar URLs include an explicit asset version and can therefore use a one-year immutable cache. Question gameplay objects are content-addressed/opaque and also use `Cache-Control: public, max-age=31536000, immutable` through the Worker fallback.

## Durable Object region choice

The host can choose `AUTO` (default) or `ASIA` when creating a room. `ASIA` supplies the broad `apac` location hint only on first Durable Object creation. Cloudflare treats location hints as best-effort; they do not guarantee a city and cannot move an existing room. The app does not infer a player's real country from IP because accelerators may exit in another country.

For a future separate Global/Asia deployment, change the two public origins and deployment routing. The multiplayer, D1, and R2 game code does not need hostname-specific rewrites.
