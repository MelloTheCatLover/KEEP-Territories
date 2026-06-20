# Backend configuration

Environment variables are loaded from `server/.env` (see `server/.env.example`).

## CORS

`CORS_ORIGIN` is a **comma-separated allowlist** of origins permitted to call
the API. Requests are sent with credentials (`Authorization` / cookies), so the
backend reflects only listed origins.

- `*` — allow any origin. Convenient for local dev; avoid in production.
- Explicit list — production. Include every frontend origin, e.g.:

```
CORS_ORIGIN=http://localhost:5173,https://keep-territories.ru,https://www.keep-territories.ru
```

The value is split on commas and trimmed in `server/src/config/env.ts`, then
passed to the `cors` middleware in `server/src/index.ts`.

## Frontend ↔ backend domains

In production the frontend (`keep-territories.ru`) and backend
(`api.keep-territories.ru`) are separate origins. The SPA targets the API via
the build-time `VITE_API_BASE_URL` (see `client/.env.production`), so the API
host must list the frontend origin(s) in `CORS_ORIGIN`.
