import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
// vite is dev-only — loaded dynamically below to avoid crash in prod bundle
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import exifrLib from "exifr";

// Support both ESM (dev via tsx) and CJS (prod bundle via esbuild)
// In CJS bundle, esbuild banner saves native __dirname as __bundle_dir before this code runs.
let _dir: string;
try { _dir = path.dirname(fileURLToPath(import.meta.url)); } catch { _dir = ''; }
// @ts-ignore — __bundle_dir injected by esbuild banner in prod bundle
const __dirname = _dir || (typeof __bundle_dir !== 'undefined' ? __bundle_dir : process.cwd());

function stripEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const parsed: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;
    parsed[key] = stripEnvValue(line.slice(separatorIndex + 1));
  }

  return parsed;
}

function loadLocalEnv(mode: string, cwd: string): Record<string, string> {
  const files = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  return files.reduce<Record<string, string>>((acc, file) => {
    Object.assign(acc, parseEnvFile(path.join(cwd, file)));
    return acc;
  }, {});
}

async function startServer() {
  const app = express();
  const mode = process.env.NODE_ENV || "development";
  const env = loadLocalEnv(mode, process.cwd());
  const PORT = Number(process.env.PORT || env.PORT || 1028);

  const readEnv = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = process.env[key] || env[key];
      if (value && value.trim()) return value.trim();
    }
    return undefined;
  };

  // --- R2 Configuration (mutable — can be swapped via /api/switch-bucket) ---
  let accountId = readEnv("CLOUDFLARE_R2_ACCOUNT_ID", "VITE_CLOUDFLARE_R2_ACCOUNT_ID");
  let accessKeyId = readEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "VITE_CLOUDFLARE_R2_ACCESS_KEY_ID");
  let secretAccessKey = readEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "VITE_CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  let bucket = readEnv("CLOUDFLARE_R2_BUCKET", "VITE_CLOUDFLARE_R2_BUCKET") || "garyhub";
  let publicBaseUrl = readEnv("CLOUDFLARE_R2_PUBLIC_URL", "VITE_CLOUDFLARE_R2_PUBLIC_URL")?.trim();

  function checkR2Config(): string | null {
    const missing: string[] = [];
    if (!accountId) missing.push("CLOUDFLARE_R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("CLOUDFLARE_R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
    if (!publicBaseUrl) missing.push("CLOUDFLARE_R2_PUBLIC_URL");
    return missing.length > 0
      ? `Missing required R2 config: ${missing.join(", ")}.`
      : null;
  }
  let r2ConfigError = checkR2Config();

  // --- D1 Configuration (mutable) ---
  let D1_ACCOUNT_ID: string | undefined = readEnv("CLOUDFLARE_ACCOUNT_ID", "D1_ACCOUNT_ID", "CLOUDFLARE_R2_ACCOUNT_ID");
  let D1_DATABASE_ID: string | undefined = readEnv("D1_DATABASE_ID");
  let D1_API_TOKEN: string | undefined = readEnv("CLOUDFLARE_API_TOKEN", "D1_API_TOKEN");
  const D1_EMAIL = readEnv("CLOUDFLARE_EMAIL", "D1_EMAIL");
  const D1_GLOBAL_KEY = readEnv("CLOUDFLARE_GLOBAL_API_KEY", "D1_GLOBAL_API_KEY");
  // Support either Bearer token OR Global API Key (email + key)
  let d1Configured = !!(D1_ACCOUNT_ID && D1_DATABASE_ID && (D1_API_TOKEN || (D1_EMAIL && D1_GLOBAL_KEY)));

  const queryD1 = async (sql: string, params: any[] = []): Promise<{ results: any[]; meta: any }> => {
    const authHeaders: Record<string, string> = D1_API_TOKEN
      ? { "Authorization": `Bearer ${D1_API_TOKEN}` }
      : { "X-Auth-Email": D1_EMAIL!, "X-Auth-Key": D1_GLOBAL_KEY! };

    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params }),
      }
    );
    const text = await resp.text();
    let json: any;
    try { json = JSON.parse(text); } catch {
      throw new Error(`D1 API error (${resp.status}): ${text}`);
    }
    if (!json.success) throw new Error(JSON.stringify(json.errors) || "D1 query failed");
    return json.result[0];
  };

  const initD1 = async () => {
    if (!d1Configured) { console.warn("[D1] Not configured — skipping table init."); return; }
    try {
      await queryD1(`CREATE TABLE IF NOT EXISTS gallery (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT NOT NULL, title TEXT NOT NULL, collection TEXT DEFAULT '', album TEXT DEFAULT '', size_bytes INTEGER, exif TEXT, created_at INTEGER NOT NULL)`);
      await queryD1(`CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, video TEXT NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '', collection TEXT DEFAULT '', album TEXT DEFAULT '', created_at INTEGER NOT NULL)`);
      await queryD1(`CREATE TABLE IF NOT EXISTS config (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
      await queryD1(`CREATE TABLE IF NOT EXISTS guestbook (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, content TEXT NOT NULL, approved INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);
      console.log("[D1] Tables ready.");
    } catch (e: any) {
      console.error("[D1] Init failed:", e.message);
    }
  };

  const sanitizePathSegment = (value: string, fallback: string): string => {
    const cleaned = value
      .trim()
      .replace(/[\\/]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_.]+|[-_.]+$/g, "");
    return cleaned || fallback;
  };

  const sanitizeFileName = (value: string): string =>
    value
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");

  let s3Client = r2ConfigError
    ? null
    : new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: accessKeyId as string,
          secretAccessKey: secretAccessKey as string,
        },
      });

  function rebuildS3Client() {
    r2ConfigError = checkR2Config();
    s3Client = r2ConfigError ? null : new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
    d1Configured = !!(D1_ACCOUNT_ID && D1_DATABASE_ID && (D1_API_TOKEN || (D1_EMAIL && D1_GLOBAL_KEY)));
  }

  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // ─── Authentication ─────────────────────────────────────────────────────────
  // Mirrors the Cloudflare Workers auth logic in functions/api/[[catchall]].ts
  const LOGIN_PASS = readEnv("LOGIN_PASS");
  const SESSION_COOKIE = "imagehub_session";
  const SESSION_SALT = "imagehub-auth-v1";
  const crypto = await import("crypto");

  const sha256Hex = (value: string): string =>
    crypto.createHash("sha256").update(value).digest("hex");

  const sessionToken = (): string =>
    sha256Hex(`${LOGIN_PASS ?? ""}:${SESSION_SALT}`);

  const parseCookies = (cookieHeader?: string): Record<string, string> => {
    if (!cookieHeader) return {};
    return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
      const [rawKey, ...rest] = part.trim().split("=");
      if (!rawKey) return acc;
      acc[rawKey] = rest.join("=");
      return acc;
    }, {});
  };

  const isAuthenticated = (req: any): boolean => {
    if (!LOGIN_PASS) return true;
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SESSION_COOKIE] === sessionToken();
  };

  app.post("/api/login", (req, res) => {
    if (!LOGIN_PASS) return res.json({ success: true });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password is required" });
    if (password !== LOGIN_PASS) return res.status(401).json({ error: "Invalid password" });
    const token = sessionToken();
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    res.json({ success: true });
  });

  app.post("/api/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ success: true });
  });

  app.get("/api/me", (req, res) => {
    res.json({ authenticated: isAuthenticated(req) });
  });

  // ─── Bucket Switch ──────────────────────────────────────────────────────
  // Allows the desktop app to hot-swap R2/D1 config without restarting server.
  app.post("/api/switch-bucket", (req, res) => {
    const cfg = req.body;
    if (!cfg || typeof cfg !== 'object') return res.status(400).json({ error: "Missing config" });

    // Local-only mode: clear all remote config
    if (cfg.__none__) {
      accountId = undefined;
      accessKeyId = undefined;
      secretAccessKey = undefined;
      bucket = '';
      publicBaseUrl = undefined;
      D1_ACCOUNT_ID = undefined;
      D1_DATABASE_ID = undefined;
      D1_API_TOKEN = undefined;
      s3Client = null;
      r2ConfigError = 'Local-only mode — remote bucket disabled';
      d1Configured = false;
      console.log('[Bucket] Switched to: Local Only');
      return res.json({ success: true, bucket: '', r2Ok: false, d1Ok: false, localOnly: true });
    }

    // Update R2
    if (cfg.CLOUDFLARE_R2_ACCOUNT_ID) accountId = cfg.CLOUDFLARE_R2_ACCOUNT_ID;
    if (cfg.CLOUDFLARE_R2_ACCESS_KEY_ID) accessKeyId = cfg.CLOUDFLARE_R2_ACCESS_KEY_ID;
    if (cfg.CLOUDFLARE_R2_SECRET_ACCESS_KEY) secretAccessKey = cfg.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (cfg.CLOUDFLARE_R2_BUCKET) bucket = cfg.CLOUDFLARE_R2_BUCKET;
    if (cfg.CLOUDFLARE_R2_PUBLIC_URL) publicBaseUrl = cfg.CLOUDFLARE_R2_PUBLIC_URL.trim();

    // Update D1
    if (cfg.CLOUDFLARE_ACCOUNT_ID) D1_ACCOUNT_ID = cfg.CLOUDFLARE_ACCOUNT_ID;
    if (cfg.D1_DATABASE_ID) D1_DATABASE_ID = cfg.D1_DATABASE_ID;
    if (cfg.CLOUDFLARE_API_TOKEN) D1_API_TOKEN = cfg.CLOUDFLARE_API_TOKEN;

    rebuildS3Client();
    initD1().catch(() => {});

    console.log(`[Bucket] Switched to: ${bucket} (R2 ${r2ConfigError ? 'ERROR' : 'OK'}, D1 ${d1Configured ? 'OK' : 'N/A'})`);
    res.json({ success: true, bucket, r2Ok: !r2ConfigError, d1Ok: d1Configured });
  });

  app.get("/api/current-bucket", (_req, res) => {
    res.json({ bucket, r2Ok: !r2ConfigError, d1Ok: d1Configured, publicBaseUrl });
  });

  // Helper: optionally resize/compress image + extract EXIF
  const processImage = async (
    buffer: Buffer,
    mimetype: string,
    options?: { resizeEnabled?: boolean; maxLongEdge?: number; jpegQuality?: number }
  ): Promise<{
    buffer: Buffer; contentType: string; sizeBytes: number;
    exif: { shotAt?: string; camera?: string; lens?: string; focalLength?: string; aperture?: string; shutter?: string; iso?: number; width?: number; height?: number; };
  }> => {
    let exif: any = {};
    try {
      const raw = await exifrLib.parse(buffer, {
        pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'PixelXDimension', 'PixelYDimension']
      });
      if (raw) {
        if (raw.DateTimeOriginal instanceof Date) exif.shotAt = raw.DateTimeOriginal.toISOString();
        const make = (raw.Make || '').trim();
        const model = (raw.Model || '').trim();
        if (make || model) exif.camera = [make, model].filter(Boolean).join(' ');
        if (raw.LensModel) exif.lens = String(raw.LensModel).trim();
        if (raw.FocalLength != null) exif.focalLength = `${raw.FocalLength}mm`;
        if (raw.FNumber != null) exif.aperture = `f/${raw.FNumber}`;
        if (raw.ExposureTime != null) {
          const et = raw.ExposureTime;
          exif.shutter = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
        }
        if (raw.ISO != null) exif.iso = Number(raw.ISO);
        if (raw.PixelXDimension) exif.width = raw.PixelXDimension;
        if (raw.PixelYDimension) exif.height = raw.PixelYDimension;
      }
    } catch (e) { console.warn('[EXIF parse]', e); }

    const resizeEnabled = options?.resizeEnabled ?? true;
    if (!resizeEnabled) {
      const info = await sharp(buffer).rotate().metadata();
      if (!exif.width && info.width) exif.width = info.width;
      if (!exif.height && info.height) exif.height = info.height;
      return { buffer, contentType: mimetype, sizeBytes: buffer.length, exif };
    }

    const maxLongEdge = Math.max(512, Math.min(7680, Number(options?.maxLongEdge) || 1920));
    const jpegQuality = Math.max(0.5, Math.min(1, Number(options?.jpegQuality) || 0.93));
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize({ width: maxLongEdge, height: maxLongEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(jpegQuality * 100) })
      .toBuffer({ resolveWithObject: true });

    if (!exif.width) exif.width = info.width;
    if (!exif.height) exif.height = info.height;

    return { buffer: data, contentType: 'image/jpeg', sizeBytes: data.length, exif };
  };

  // API Route for R2 Upload
  // Path structure: {collection}/{category}/{timestamp}-{filename}
  app.post("/api/upload-r2", upload.single("file"), async (req, res) => {
    try {
      if (r2ConfigError || !s3Client || !publicBaseUrl) {
        return res.status(503).json({ error: r2ConfigError || "R2 upload service is not configured" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      const rawCollection = typeof req.body?.collection === "string" ? req.body.collection : "";
      const rawCategory = typeof req.body?.category === "string" ? req.body.category : "";
      const collection = rawCollection.trim() ? sanitizePathSegment(rawCollection, "Collection") : "";
      const category = sanitizePathSegment(rawCategory || "Uncategorized", "Uncategorized");
      const resizeEnabled = String(req.body?.resizeEnabled ?? "true").toLowerCase() !== "false";
      const maxLongEdge = Number(req.body?.maxLongEdge);
      const jpegQuality = Number(req.body?.jpegQuality);

      let uploadBuffer = file.buffer;
      let contentType = file.mimetype;
      let sizeBytes: number | undefined;
      let exifData: object | undefined;
      let originalName = sanitizeFileName(file.originalname) || "file";

      if (file.mimetype.startsWith('image/')) {
        try {
          const processed = await processImage(file.buffer, file.mimetype, {
            resizeEnabled,
            maxLongEdge,
            jpegQuality,
          });
          uploadBuffer = processed.buffer;
          contentType = processed.contentType;
          sizeBytes = processed.sizeBytes;
          exifData = processed.exif;
          originalName = originalName.replace(/\.[^.]+$/, '.jpg');
          if (!originalName.endsWith('.jpg')) originalName += '.jpg';
        } catch (e) {
          console.warn("Image processing failed, uploading original:", e);
        }
      }

      const fileName = `${Date.now()}-${originalName}`;
      const objectPath = collection ? `${collection}/${category}` : category;
      const objectKey = `${objectPath}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: uploadBuffer,
        ContentType: contentType,
      });

      await s3Client.send(command);
      const secureUrl = `${publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`;

      res.json({ secureUrl, ...(sizeBytes != null && { sizeBytes }), ...(exifData && { exif: exifData }) });
    } catch (error: any) {
      console.error("Server-side R2 Upload Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // API Route for R2 Delete
  app.post("/api/delete-r2", async (req, res) => {
    try {
      if (r2ConfigError || !s3Client) {
        return res.status(503).json({ error: "R2 service not configured" });
      }
      const { key } = req.body;
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: "Missing 'key' in request body" });
      }
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      res.json({ success: true });
    } catch (error: any) {
      console.error("R2 Delete Error:", error);
      res.status(500).json({ error: error.message || "Delete failed" });
    }
  });

  // ─── D1 Database API ──────────────────────────────────────────────────────

  const mapGalleryRow = (row: any) => ({
    id: String(row.id),
    src: row.src,
    title: row.title,
    collection: row.collection || '',
    album: row.album || '',
    ...(row.size_bytes != null && { sizeBytes: row.size_bytes }),
    ...(row.exif && { exif: (() => { try { return JSON.parse(row.exif); } catch { return undefined; } })() }),
    createdAt: row.created_at,
  });

  const mapVideoRow = (row: any) => ({
    id: String(row.id),
    video: row.video,
    title: row.title,
    desc: row.description || '',
    collection: row.collection || '',
    album: row.album || '',
    createdAt: row.created_at,
  });

  const mapGuestbookRow = (row: any) => ({
    id: String(row.id),
    name: row.name,
    email: row.email,
    content: row.content,
    approved: row.approved === 1,
    date: new Date(row.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    createdAt: row.created_at,
  });

  // Gallery CRUD
  app.get("/api/gallery", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const result = await queryD1("SELECT * FROM gallery ORDER BY created_at DESC");
      res.json({ items: result.results.map(mapGalleryRow) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/gallery", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { src, title, collection, album, sizeBytes, exif } = req.body;
      const now = Date.now();
      const result = await queryD1(
        "INSERT INTO gallery (src, title, collection, album, size_bytes, exif, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [src, title || '', collection || '', album || '', sizeBytes ?? null, exif ? JSON.stringify(exif) : null, now]
      );
      res.json({ id: String(result.meta.last_row_id), createdAt: now });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Batch insert — single round-trip for N photos
  app.post("/api/gallery/batch", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: "items array required" });
      const now = Date.now();
      const ids: string[] = [];
      for (const item of items as any[]) {
        const result = await queryD1(
          "INSERT INTO gallery (src, title, collection, album, size_bytes, exif, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [item.src, item.title || '', item.collection || '', item.album || '', item.sizeBytes ?? null, item.exif ? JSON.stringify(item.exif) : null, now]
        );
        ids.push(String(result.meta.last_row_id));
      }
      res.json({ ids, createdAt: now });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Batch move — update collection/album for many ids
  app.post("/api/gallery/batch-move", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { ids, collection, album } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
      let succeeded = 0, failed = 0;
      for (const id of ids) {
        try {
          await queryD1("UPDATE gallery SET collection = ?, album = ? WHERE id = ?", [collection, album, Number(id)]);
          succeeded++;
        } catch { failed++; }
      }
      res.json({ succeeded, failed });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/gallery/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { id } = req.params;
      const { src, title, collection, album, sizeBytes, exif } = req.body;
      const sets: string[] = [];
      const params: any[] = [];
      if (src !== undefined) { sets.push("src = ?"); params.push(src); }
      if (title !== undefined) { sets.push("title = ?"); params.push(title); }
      if (collection !== undefined) { sets.push("collection = ?"); params.push(collection); }
      if (album !== undefined) { sets.push("album = ?"); params.push(album); }
      if (sizeBytes !== undefined) { sets.push("size_bytes = ?"); params.push(sizeBytes); }
      if (exif !== undefined) { sets.push("exif = ?"); params.push(JSON.stringify(exif)); }
      if (sets.length === 0) return res.json({ success: true });
      params.push(Number(id));
      await queryD1(`UPDATE gallery SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/gallery/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      await queryD1("DELETE FROM gallery WHERE id = ?", [Number(req.params.id)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Videos CRUD
  app.get("/api/videos", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const result = await queryD1("SELECT * FROM videos ORDER BY created_at DESC");
      res.json({ items: result.results.map(mapVideoRow) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/videos", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { video, title, desc, collection, album } = req.body;
      const now = Date.now();
      const result = await queryD1(
        "INSERT INTO videos (video, title, description, collection, album, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [video, title || '', desc || '', collection || '', album || '', now]
      );
      res.json({ id: String(result.meta.last_row_id), createdAt: now });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/videos/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { id } = req.params;
      const { video, title, desc, collection, album } = req.body;
      const sets: string[] = [];
      const params: any[] = [];
      if (video !== undefined) { sets.push("video = ?"); params.push(video); }
      if (title !== undefined) { sets.push("title = ?"); params.push(title); }
      if (desc !== undefined) { sets.push("description = ?"); params.push(desc); }
      if (collection !== undefined) { sets.push("collection = ?"); params.push(collection); }
      if (album !== undefined) { sets.push("album = ?"); params.push(album); }
      if (sets.length === 0) return res.json({ success: true });
      params.push(Number(id));
      await queryD1(`UPDATE videos SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/videos/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      await queryD1("DELETE FROM videos WHERE id = ?", [Number(req.params.id)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Config
  app.get("/api/config", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const result = await queryD1("SELECT data FROM config WHERE id = 'main'");
      if (result.results.length === 0) return res.json({ data: null });
      res.json({ data: JSON.parse(result.results[0].data) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/config", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      await queryD1("INSERT OR REPLACE INTO config (id, data) VALUES ('main', ?)", [JSON.stringify(req.body)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Guestbook
  app.get("/api/guestbook", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const result = await queryD1("SELECT * FROM guestbook ORDER BY created_at DESC");
      res.json({ messages: result.results.map(mapGuestbookRow) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/guestbook", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { name, email, content } = req.body;
      const now = Date.now();
      const result = await queryD1(
        "INSERT INTO guestbook (name, email, content, approved, created_at) VALUES (?, ?, ?, 0, ?)",
        [name, email, content, now]
      );
      res.json({
        id: String(result.meta.last_row_id),
        name, email, content,
        approved: false,
        date: new Date(now).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        createdAt: now,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/guestbook/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      const { approved } = req.body;
      await queryD1("UPDATE guestbook SET approved = ? WHERE id = ?", [approved ? 1 : 0, Number(req.params.id)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/guestbook/:id", async (req, res) => {
    if (!d1Configured) return res.status(503).json({ error: "D1 not configured" });
    try {
      await queryD1("DELETE FROM guestbook WHERE id = ?", [Number(req.params.id)]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Vite middleware / static files ──────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("/{*splat}", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // Start listening FIRST so Electron can detect the server is ready,
  // then initialize D1 tables in the background (non-blocking).
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hub server running on http://localhost:${PORT}`);
    if (r2ConfigError) console.warn(`[R2] Upload API disabled: ${r2ConfigError}`);
    if (!d1Configured) console.warn("[D1] Database API disabled: Missing D1_DATABASE_ID or CLOUDFLARE_API_TOKEN.");
  });

  initD1().catch(e => console.error("[D1] Background init failed:", e));
}

startServer();
