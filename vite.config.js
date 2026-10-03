import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// POST /api/mp4 with a recorded video → Instagram/phone-ready MP4 made by the system ffmpeg:
// H.264 High, yuv420p, constant 30 fps, AAC 48 kHz, index up front. Browsers like Firefox
// can't encode H.264/AAC themselves, so the local dev/preview server does it.
function mp4Converter() {
  const handler = async (req, res, next) => {
    if (req.url !== '/api/mp4' || req.method !== 'POST') return next();
    const dir = await mkdtemp(join(tmpdir(), 'routefly-'));
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = join(dir, 'input'), output = join(dir, 'output.mp4');
      await writeFile(input, Buffer.concat(chunks));
      await run('ffmpeg', [
        '-y', '-v', 'error', '-i', input,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '12M', '-bufsize', '24M',
        '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-r', '30', '-fps_mode', 'cfr',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart', output,
      ]);
      res.setHeader('content-type', 'video/mp4');
      res.end(await readFile(output));
    } catch (err) {
      res.statusCode = 500;
      res.end(err.message);
    } finally {
      rm(dir, { recursive: true, force: true });
    }
  };
  return {
    name: 'routefly-mp4',
    // Braces matter: a function returned from these hooks would be run as a post-hook.
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(new Error(`${cmd} not available (${err.message})`)));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').at(-1) || `${cmd} failed`))));
  });
}

export default defineConfig({
  worker: { format: 'es' },
  plugins: [mp4Converter()],
});
