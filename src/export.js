// Convert a finished recording into a phone/social-media friendly MP4: H.264 video at a
// constant 30 fps plus AAC audio, with the index up front so it starts playing at once.
// Instagram, WhatsApp and phones expect this; browsers often record WebM/VP8 instead.
//
// Preferred: the local Route Flyover server converts with the system ffmpeg (see vite.config.js).
// Fallback, e.g. when the app is served as static files: convert in the browser, which
// only works where the browser can really encode H.264 (Chrome; not Firefox on Linux).
import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, Conversion, canEncodeAudio } from 'mediabunny';

// onProgress(fraction 0–1 or null when unknown, encoder: 'nvenc' | 'x264' | undefined).
// Rejects with an AbortError if `signal` fires.
export async function toMp4(blob, onProgress, signal) {
  let res = null;
  try {
    res = await fetch('/api/mp4', { method: 'POST', body: blob, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    // No local server (static hosting): fall through to the browser.
  }
  // Only Route Flyover's own server answers with JSON; anything else (404/405 from static
  // hosting such as Cloudflare) means there's no converter here.
  const fromConverter = res?.headers.get('content-type')?.includes('application/json');
  if (res?.ok && fromConverter) return convertOnServer((await res.json()).id, onProgress, signal);
  if (fromConverter) throw new Error((await res.json()).error || res.statusText);
  return toMp4InBrowser(blob, onProgress);
}

async function convertOnServer(id, onProgress, signal) {
  const cancel = () => fetch(`/api/mp4/${id}`, { method: 'DELETE' });
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      signal?.throwIfAborted();
      const status = await (await fetch(`/api/mp4/${id}`)).json();
      if (status.error) throw new Error(status.error);
      onProgress(status.progress, status.encoder);
      if (status.done) break;
    }
    const file = await fetch(`/api/mp4/${id}/file`, { signal });
    return new Blob([await file.arrayBuffer()], { type: 'video/mp4' });
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

async function toMp4InBrowser(blob, onProgress) {
  // Some browsers can't encode AAC natively; a WASM encoder fills in, loaded only then.
  if (!(await canEncodeAudio('aac'))) (await import('@mediabunny/aac-encoder')).registerAacEncoder();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    video: { codec: 'avc', frameRate: 30, bitrate: 8e6, forceTranscode: true },
    audio: { codec: 'aac', bitrate: 192e3 },
  });
  if (!conversion.isValid) {
    throw new Error(conversion.discardedTracks.map((t) => t.reason).join(', ') || 'this browser cannot encode H.264');
  }
  conversion.onProgress = onProgress;
  await conversion.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
