# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # frontend only (Vite, hot reload) — expects the backend already running
npm run dev:server # backend only (tsx watch, auto-restart)
npm run dev:all     # both together, proxied as one app — normal way to develop
npm run build       # tsc -b (both tsconfig projects) && vite build -> dist/
npm start           # runs the built server (tsx server/index.ts), serves API + dist/ + WS on :3001
```

There is no lint script and no test suite. `npm run build` (which runs `tsc -b` first) is
the only verification step — it fails on any TypeScript error, and `tsconfig.app.json` has
`strict`, `noUnusedLocals`, and `noUnusedParameters` on, so unused imports/vars are build
failures, not warnings. There's no ESLint config, and no Cursor/Copilot rule files in this repo.

In dev, Vite proxies `/api` and `/ws` to `http://localhost:3001` (see `vite.config.ts`), so
`npm run dev:all` is effectively one app on the Vite port. In production, `server/index.ts`
serves `dist/` itself (SPA fallback: any non-`/api` route serves `index.html`; routing is a
hash router, `createHashRouter`, so this rarely matters). Docker builds via the multi-stage
`Dockerfile` (build stage runs `npm run build`; runtime stage only ships `dist/` + `server/`)
and runs the same `tsx server/index.ts` entrypoint, with `server/data` as the mounted volume.

## Architecture

**No database.** The server (`server/index.ts`, a single file, run directly via `tsx` — no
build step for the backend) persists each project as one JSON file in `server/data/projects/`
and uploaded images as opaque files in `server/data/blobs/` (with a `blobs-meta.json` id→MIME
map alongside). Blobs are never garbage-collected when a floor/project/icon is deleted, so
`server/data/blobs/` accumulates orphans over time — expected, not a bug.

**Live sync, not local persistence.** There is no offline mode and no client-side cache: the
app is unusable without the server reachable. Every project mutation goes through a single
`mutate()` in `src/lib/store.ts` (Zustand), which clones the project, applies the change,
updates local state immediately, and pushes to the server over a 400ms-debounced `PUT
/api/projects/:id` (`schedulePush`). The server broadcasts the saved project to every
connected client over WebSocket (`server/index.ts`'s `broadcast`, one `wss` for the whole
server — no rooms/auth, everyone sees everything). `src/lib/ws.ts` is a
self-reconnecting client with exponential backoff; `store.ts` wires its `onProject` handler to
merge incoming broadcasts into local state, *unless* this client has its own edit for that
project still in flight (`pendingSaveId` guard) — otherwise a fast local drag could be
clobbered by the echo of an earlier, now-stale broadcast.

**Domain model** (`src/types.ts`) is one `Project` containing `floors: Floor[]`, `panels:
Panel[]`, and `catalog: IconType[]`. A `Floor` has `placements: Placement[]` (fixture icons
dropped on that floor's uploaded image, in image-pixel coordinates). A `Panel` has
`breakers: Breaker[]`. The link between the two trees is `Placement.breakerIds: string[]` —
plain id references, not nested objects — which is why most "given a breaker, find its
fixtures" or vice-versa logic (`src/lib/linking.ts`, `ReportView.tsx`'s
`BreakerFixtureSection`) does a manual scan over `project.floors`/`project.panels` rather than
following a pointer.

**Panel layout** (`src/lib/panelLayout.ts`) is pure geometry, independent of React: given a
`Panel`'s `spaces`/`columns`/`numbering`, `computePanelLayout` derives which physical
row/column each printed slot number lands in (odd-even: left column odd going down, right
column even; sequential: left column top-to-bottom then continues down the right). Multi-pole
breakers (`span: 1 | 2 | 3`) stack *within* a column, so slot numbers step by 2 in a 2-column
odd/even panel. This module is the single source of truth for slot geometry, shared by the
interactive `PanelDiagram` and the static `ReportView` panel figure — don't reimplement the
row/column math in either consumer.

**Floor plan canvas** (`FloorPlanCanvas.tsx`) is a hand-rolled pointer-driven pan/zoom
surface using CSS transforms (`translate`/`scale` on a `.fpc-layer` div) — deliberately not a
canvas library (Konva etc.). Markers zoom with the floor plan (not pinned to a constant
on-screen size); `markerScale()` derives their size from a ratio to the initial fit-to-view
scale, clamped between a floor (`MIN_MARKER_PX`) and a ceiling tied to the marker's own
`Placement.scale`, so they stay legible at extreme zoom without growing unbounded.

**Report/print** (`src/components/report/ReportView.tsx` + `ReportView.css` + `src/print.css`)
renders a fixed-width (`8.5in`) on-screen preview that becomes the printed/PDF output via
`window.print()` — there's no separate PDF-generation path, so the preview and the print
output are the same DOM styled by `@media print` overrides in `print.css`. A panel's diagram
paginates itself past `PANEL_PAGE_SLOT_LIMIT` (40) slots rather than shrinking to fit one
page, splitting at a row boundary that never cuts a multi-pole breaker's cell in half
(`computeFirstPageRows`). `print.css` also has to reset several ancestors' `overflow`/`height`
(`.ed`, `.ed-body`, `.ed-content`, `.rv-wrap` all fix themselves to viewport height for the
normal scrolling app UI) and keep `.report` in *normal* document flow rather than
`position: absolute` — both were sources of real bugs (content silently clipped to one page;
compounding blank pages under some print pipelines) documented inline in `print.css`'s
comments, so preserve that reasoning if touching it again.

**No native `window.confirm`/`prompt`/`alert`.** `src/lib/dialog.tsx` is a tiny imperative
dialog service (`promptDialog` / `confirmDialog` / `chooseDialog`, each returning a `Promise`)
backed by a single `<DialogHost/>` mounted once at the app root (`main.tsx`) — native dialogs
break embedding and look off-brand, so any confirmation/prompt flow should go through this
instead.

**Routing** is a two-route hash router (`main.tsx`): `/` (`ProjectList`) and `/project/:id`
(`Editor`, which internally switches between Workspace/Panels/Report via local tab state, not
sub-routes — see `MOBILE_TABS`/`DESKTOP_TABS` in `Editor.tsx`). Desktop shows the floor plan
and breaker panel together in one "Workspace" view; mobile splits them into separate tabs
since there isn't room for both, with a bottom nav instead of the desktop tab bar.
