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
  // Ask first: on static hosting there is no converter, and the upload would be wasted.
  if (!(await hasConverter())) return toMp4InBrowser(blob, onProgress);
  const res = await fetch('/api/mp4', { method: 'POST', body: blob, signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return convertOnServer(body.id, onProgress, signal);
}

// Only Route Flyover's own server answers this with JSON; anything else (404/405 from static
// hosting such as Cloudflare) means there's no converter here. Asked once per page load.
let converterProbe = null;
function hasConverter() {
  converterProbe ??= fetch('/api/mp4')
    .then((r) => r.ok && !!r.headers.get('content-type')?.includes('application/json'))
    .catch(() => false);
  return converterProbe;
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
    return (await file.blob()).slice(0, undefined, 'video/mp4');
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
