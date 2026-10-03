import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Local MP4 conversion with the system ffmpeg: H.264 High, yuv420p, constant 30 fps,
// AAC 48 kHz, index up front — what Instagram and phones expect. Browsers like Firefox
// can't encode H.264/AAC themselves, so the local dev/preview server does it.
// Uses the NVIDIA GPU encoder (NVENC) when it works on this machine, else the CPU (x264).
//
//   POST   /api/mp4           body: the recorded video  → { id }
//   GET    /api/mp4/:id       → { progress (0–1, or null if unknown), done, error, encoder }
//   GET    /api/mp4/:id/file  → the MP4 (the job is cleaned up afterwards)
//   DELETE /api/mp4/:id       → cancel
const ENCODERS = {
  // ~2.4× faster than x264 on an RTX 5060 Ti at the same picture quality (SSIM) and size.
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', '25', '-b:v', '0'],
  x264: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '21'],
};
const COMMON_ARGS = [
  '-maxrate', '12M', '-bufsize', '24M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-r', '30', '-fps_mode', 'cfr',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-movflags', '+faststart',
];

// Whether NVENC really works here (driver loaded, GPU usable), checked with a tiny test
// encode rather than just looking for the card. A failed check is retried after a while,
// e.g. once a GPU-hungry program has freed the card.
let nvenc = { at: 0, ok: null };
async function nvencWorks() {
  if (nvenc.ok === true || (nvenc.ok === false && Date.now() - nvenc.at < 5 * 60e3)) return nvenc.ok;
  const ok = await new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.2',
      '-c:v', 'h264_nvenc', '-f', 'null', '-']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
  nvenc = { at: Date.now(), ok };
  return ok;
}

function mp4Converter() {
  const jobs = new Map(); // id → { dir, output, progress, done, error, proc }

  const cleanup = (id) => {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    job.proc?.kill();
    rm(job.dir, { recursive: true, force: true });
  };

  const json = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const handler = async (req, res, next) => {
    const m = req.url.match(/^\/api\/mp4(?:\/([\w-]+))?(\/file)?$/);
    if (!m) return next();
    const [, id, file] = m;
    const job = id && jobs.get(id);
    if (id && !job) return json(res, 404, { error: 'unknown job' });

    try {
      if (!id && req.method === 'POST') {
        const dir = await mkdtemp(join(tmpdir(), 'route-flyover-'));
        const input = join(dir, 'input'), output = join(dir, 'output.mp4');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        await writeFile(input, Buffer.concat(chunks));
        const newId = randomUUID();
        const duration = await probeDuration(input);
        const entry = { dir, output, progress: duration ? 0 : null, done: false, error: null, encoder: null };
        jobs.set(newId, entry);
        // GPU first if it works; if it fails mid-job (e.g. out of GPU memory), redo on the CPU.
        const order = (await nvencWorks()) ? ['nvenc', 'x264'] : ['x264'];
        const start = (i) => {
          entry.encoder = order[i];
          entry.progress = duration ? 0 : null;
          entry.proc = runFfmpeg(['-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-i', input, ...ENCODERS[order[i]], ...COMMON_ARGS, output], {
            onTime: (seconds) => { if (duration) entry.progress = Math.min(1, seconds / duration); },
            onExit: (error) => {
              if (error && error !== 'cancelled' && order[i + 1] && jobs.has(newId)) {
                console.warn(`[route-flyover] ${order[i]} failed (${error}); converting with ${order[i + 1]} instead`);
                start(i + 1);
                return;
              }
              entry.done = true;
              entry.error = error;
              entry.proc = null;
            },
          });
        };
        start(0);
        // Drop jobs nobody collects.
        setTimeout(() => cleanup(newId), 60 * 60e3).unref();
        return json(res, 200, { id: newId });
      }
      if (job && !file && req.method === 'GET') {
        return json(res, 200, { progress: job.progress, done: job.done, error: job.error, encoder: job.encoder });
      }
      if (job && file && req.method === 'GET' && job.done && !job.error) {
        res.setHeader('content-type', 'video/mp4');
        createReadStream(job.output).on('close', () => cleanup(id)).pipe(res);
        return;
      }
      if (job && req.method === 'DELETE') {
        cleanup(id);
        return json(res, 200, { cancelled: true });
      }
      return json(res, 400, { error: 'bad request' });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  };

  return {
    name: 'route-flyover-mp4',
    // Braces matter: a function returned from these hooks would be run as a post-hook.
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

// Duration in seconds, or null if the container doesn't say.
function probeDuration(file) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.on('error', () => resolve(null));
    proc.on('close', () => resolve(parseFloat(out) || null));
  });
}

// Runs ffmpeg, reporting the encoded time from its -progress output.
function runFfmpeg(args, { onTime, onExit }) {
  const proc = spawn('ffmpeg', args);
  let stderr = '';
  proc.stdout.on('data', (d) => {
    for (const m of String(d).matchAll(/out_time_us=(\d+)/g)) onTime(Number(m[1]) / 1e6);
  });
  proc.stderr.on('data', (d) => { stderr += d; });
  proc.on('error', (err) => onExit(`ffmpeg not available (${err.message})`));
  proc.on('close', (code, signal) => {
    if (code === 0) onExit(null);
    else onExit(signal ? 'cancelled' : stderr.trim().split('\n').at(-1) || 'ffmpeg failed');
  });
  return proc;
}

export default defineConfig({
  worker: { format: 'es' },
  plugins: [mp4Converter()],
});
