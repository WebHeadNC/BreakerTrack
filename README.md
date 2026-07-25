# BreakerTrack

A web app for mapping a home's electrical layout: upload floor plans, place fixture
icons (lights, fans, outlets, appliances), model breaker panels in detail, and link
each breaker to the fixtures it powers — click a breaker to highlight its fixtures on
the plan, or click a fixture to highlight its breaker. Includes a printable / PDF
report. Runs as a small shared server so everyone on your network sees the same data,
live.

## Features

- **Floor plans** — upload an image per floor (multiple floors per project); pan,
  zoom, and drop icon markers with drag, rotate, scale, and labels.
- **Editable icon catalog** — built-in electrical glyphs plus custom appliances you
  name and give an uploaded icon.
- **Breaker panels** — multiple panels (main + subpanels), each with model, main
  amperage, voltage, space count, 1/2 columns, and odd-even or sequential numbering.
- **Breakers** — amps, type (Standard / AFCI / GFCI / Dual AFCI-GFCI / CAFCI), and
  multi-slot (1–3 pole) breakers that span the diagram.
- **View / Edit modes** — View is pure inspection (click an icon or breaker to ring
  everything on that circuit, in red); Edit unlocks placing/moving icons and
  adding/editing breakers and links.
- **Report / print** — a schedule table per panel and floor plans with numbered pins +
  legend; print or Save-as-PDF via the browser.
- **Shared & live** — one server on your network holds the data; every connected
  device sees edits appear instantly (WebSocket push), no login required.
- **Responsive** — works on desktop and phone (touch pan/pinch-zoom, bottom nav,
  slide-up drawers).

## Running it

```bash
npm install
npm run build   # compiles the frontend into dist/
npm start       # starts the server on :3001, serving the app + API + live sync
```

Then open `http://localhost:3001` yourself, or `http://<this-PC's-LAN-IP>:3001` from
any other device on the network. The server has to keep running for others to reach
it — if you close it, nobody (including you) can load the app until it's started again.

### Development

```bash
npm run dev:all   # frontend (Vite, hot reload) + backend together, proxied as one app
```

`npm run dev` (frontend only) and `npm run dev:server` (backend only, auto-restart) are
also available individually.

### Docker

Since there's no database — just JSON files and images on disk — this runs as a single
container with one persistent volume.

**On a machine with this repo checked out**, build locally:

```bash
docker compose up -d --build
```

**On any other machine** (no source needed — just the `docker-compose.yml` file),
pull the image instead. Every push to `master` publishes a fresh image via
[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) to
GitHub Container Registry:

```bash
docker login ghcr.io -u <your-github-username>   # one-time; repo is private, so the image is too
docker compose pull
docker compose up -d
```

For `docker login ghcr.io`, use a
[personal access token](https://github.com/settings/tokens) with `read:packages`
scope as the password (not your GitHub password).

Either way: visit `http://localhost:3001`, or `http://<host's-LAN-IP>:3001` from any
other device on the network. Project data lives in the `breakertrack-data` Docker
volume, so it survives rebuilds/restarts; `docker compose down` stops it without
losing data, `docker compose down -v` deletes the volume too (that *does* lose your
data).

To update: `docker compose up -d --build` (local build) or `docker compose pull &&
docker compose up -d` (pulled image) again.

Note: on Windows, Docker Desktop's own background process (not `node.exe`) is what
binds the port on the host, so if other devices can't reach it, check Windows
Firewall for rules affecting **Docker Desktop** / `com.docker.backend.exe`, not
Node.js — a different process than when running it directly with `npm start`.

## Tech

**Frontend:** React + TypeScript + Vite, Zustand (state), lucide-react (icons),
react-router-dom. The floor-plan canvas is a custom pointer-driven pan/zoom surface
(HTML/CSS transforms) so it can render both Lucide SVG glyphs and uploaded images as
markers with CSS glow highlighting.

**Backend:** a small Express server (`server/index.ts`, run via `tsx`) that stores each
project as a JSON file under `server/data/projects/` and uploaded images under
`server/data/blobs/`, and pushes every change to all connected clients over a
WebSocket (`ws`) so everyone's view stays in sync. No database server, no build step
for the backend.

## Data & privacy

Everyone who can reach the server on your network can view and edit — there's no
login. Data lives in `server/data/` on whichever machine runs the server; back it up
by copying that folder, or use a project's **Export** button for a single-file backup.
Blobs (images) aren't garbage-collected when a floor or project is deleted, so
`server/data/blobs/` can accumulate orphaned files over time — harmless, just disk
space.

**No offline mode**: the app needs the server reachable to load or save anything.
