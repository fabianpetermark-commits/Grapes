import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'grapes.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny', maxAge: '1d' }));

function auth(req, res, next) {
  const configuredKey = process.env.API_KEY;
  if (!configuredKey) return next();
  const supplied = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (supplied !== configuredKey) return res.status(401).json({ error: 'Érvénytelen vagy hiányzó API-kulcs.' });
  next();
}

function projectPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'A projekt JSON-objektum kell legyen.' };
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length > 160) return { error: 'A név kötelező és legfeljebb 160 karakteres lehet.' };
  const data = payload.data ?? payload.project ?? {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'A data mezőnek JSON-objektumnak kell lennie.' };
  return { value: { name, data } };
}

function toProject(row) {
  return { id: row.id, name: row.name, data: JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', auth);

app.get('/api/projects', (_req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  res.json({ projects: rows.map(toProject) });
});

app.get('/api/projects/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'A projekt nem található.' });
  res.json(toProject(row));
});

app.post('/api/projects', (req, res) => {
  const result = projectPayload(req.body);
  if (result.error) return res.status(400).json(result);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO projects (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, result.value.name, JSON.stringify(result.value.data), now, now);
  res.status(201).json(toProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)));
});

app.put('/api/projects/:id', (req, res) => {
  const result = projectPayload(req.body);
  if (result.error) return res.status(400).json(result);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'A projekt nem található.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE projects SET name = ?, data = ?, updated_at = ? WHERE id = ?')
    .run(result.value.name, JSON.stringify(result.value.data), now, req.params.id);
  res.json(toProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)));
});

app.delete('/api/projects/:id', (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'A projekt nem található.' });
  res.status(204).end();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024), files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/i.test(file.mimetype)),
});

app.post('/api/uploads', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Engedélyezett képfájl szükséges (JPEG, PNG, WebP vagy GIF).' });
  try {
    const image = sharp(req.file.buffer, { failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) {
      return res.status(415).json({ error: 'A fájl tartalma nem támogatott képformátum.' });
    }
    const filename = `${crypto.randomUUID()}.webp`;
    await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(uploadDir, filename));
    const url = `/uploads/${filename}`;
    res.status(201).json({
      url,
      filename,
      width: metadata.width,
      height: metadata.height,
      data: { src: url, type: 'image', width: metadata.width, height: metadata.height },
      assets: [{ src: url, type: 'image', width: metadata.width, height: metadata.height }],
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/pdf', async (req, res, next) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'A projekt nem található.' });
  let browser;
  try {
    const body = req.body || {};
    const html = typeof body.html === 'string' ? body.html : (toProject(row).data.html || '');
    const css = typeof body.css === 'string' ? body.css : (toProject(row).data.css || '');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    res.type('application/pdf').set('Content-Disposition', `attachment; filename="${row.name.replace(/[^a-z0-9_-]+/gi, '_') || 'project'}.pdf"`).send(pdf);
  } catch (error) {
    next(error);
  } finally {
    if (browser) await browser.close();
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A kép túl nagy.' });
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Érvénytelen feltöltés.' });
  console.error(error);
  res.status(500).json({ error: 'Belső szerverhiba.' });
});

const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== 'test' && !process.argv.includes('--test')) {
  app.listen(port, () => console.log(`GRapes API listening on http://localhost:${port}`));
}

export { app, db };
