import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import { WebSocket, WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT) || 3001

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')
const BLOBS_DIR = path.join(DATA_DIR, 'blobs')
const BLOBS_META_FILE = path.join(DATA_DIR, 'blobs-meta.json')
const DIST_DIR = path.join(process.cwd(), 'dist')

fs.mkdirSync(PROJECTS_DIR, { recursive: true })
fs.mkdirSync(BLOBS_DIR, { recursive: true })

// --- Blob MIME-type index (blob id -> content type) ------------------------

function loadBlobMeta(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(BLOBS_META_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveBlobMeta(meta: Record<string, string>) {
  fs.writeFileSync(BLOBS_META_FILE, JSON.stringify(meta))
}

// --- App ---------------------------------------------------------------------

const app = express()
app.use(express.json({ limit: '10mb' }))
// The frontend is always same-origin (Vite proxies /api and /ws in dev; this
// same server serves dist/ in production), so no cross-origin API access is
// needed — leaving CORS unconfigured (default same-origin only) keeps a
// third-party page from reading this unauthenticated API via a victim's
// browser. Pairs with the nosniff header below against MIME-confusion XSS.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})

function projectFilePath(id: string): string {
  return path.join(PROJECTS_DIR, `${id}.json`)
}

function isValidId(id: string): boolean {
  // Project/blob ids are always crypto.randomUUID() — reject anything else
  // outright so path.join can't be tricked into escaping the data dirs.
  return /^[0-9a-f-]{36}$/i.test(id)
}

// Placements used to carry a single optional `breakerId`; they now carry a
// `breakerIds` array (to support linking one fixture to more than one
// breaker). Upgrade older project files in place as they're read so a
// pre-existing deployment doesn't crash on load.
function normalizeProject(project: any): any {
  for (const floor of project.floors ?? []) {
    for (const pl of floor.placements ?? []) {
      if (!Array.isArray(pl.breakerIds)) {
        pl.breakerIds = pl.breakerId ? [pl.breakerId] : []
      }
      delete pl.breakerId
    }
  }
  return project
}

function readProjectFile(file: string): any {
  return normalizeProject(JSON.parse(fs.readFileSync(file, 'utf8')))
}

// --- Projects ----------------------------------------------------------------

app.get('/api/projects', (_req, res) => {
  const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json'))
  const projects = files.map((f) => readProjectFile(path.join(PROJECTS_DIR, f)))
  res.json(projects)
})

app.get('/api/projects/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' })
  const file = projectFilePath(req.params.id)
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' })
  res.json(readProjectFile(file))
})

app.post('/api/projects', (req, res) => {
  const project = req.body
  if (!project?.id || !isValidId(project.id)) return res.status(400).json({ error: 'missing/bad id' })
  fs.writeFileSync(projectFilePath(project.id), JSON.stringify(project))
  broadcast({ type: 'project', project })
  res.status(201).json({ ok: true })
})

app.put('/api/projects/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' })
  const project = req.body
  if (!project || project.id !== req.params.id) return res.status(400).json({ error: 'id mismatch' })
  fs.writeFileSync(projectFilePath(req.params.id), JSON.stringify(project))
  broadcast({ type: 'project', project })
  res.json({ ok: true })
})

app.delete('/api/projects/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' })
  const file = projectFilePath(req.params.id)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  broadcast({ type: 'project-deleted', id: req.params.id })
  res.json({ ok: true })
})

// --- Blobs (floor plan images, custom icons) ----------------------------------

// Blobs are only ever floor plan photos or icon images — restrict uploads to
// real raster image types. SVG is deliberately excluded even though it's an
// "image" format, since it can carry <script> content that would execute if
// a blob URL is ever opened as a top-level document (browsers replay the
// stored Content-Type verbatim on GET /api/blobs/:id).
const ALLOWED_BLOB_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_BLOB_TYPES.has(file.mimetype)),
})

app.post('/api/blobs', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' })
  const id = crypto.randomUUID()
  fs.writeFileSync(path.join(BLOBS_DIR, id), req.file.buffer)
  const meta = loadBlobMeta()
  meta[id] = req.file.mimetype || 'application/octet-stream'
  saveBlobMeta(meta)
  res.status(201).json({ id })
})

app.get('/api/blobs/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).end()
  const filePath = path.join(BLOBS_DIR, req.params.id)
  if (!fs.existsSync(filePath)) return res.status(404).end()
  const meta = loadBlobMeta()
  res.setHeader('Content-Type', meta[req.params.id] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  fs.createReadStream(filePath).pipe(res)
})

app.delete('/api/blobs/:id', (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'bad id' })
  const filePath = path.join(BLOBS_DIR, req.params.id)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  const meta = loadBlobMeta()
  delete meta[req.params.id]
  saveBlobMeta(meta)
  res.json({ ok: true })
})

// --- Serve the built frontend (production) ------------------------------------

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

// --- WebSocket: broadcast project changes to every connected client -----------

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

function broadcast(msg: unknown) {
  const data = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data)
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BreakerTrack server listening on http://0.0.0.0:${PORT}`)
  if (!fs.existsSync(DIST_DIR)) {
    console.log('(No dist/ build found yet — run `npm run build` to serve the app from this port.)')
  }
})
