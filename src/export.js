// Convert a finished recording into a phone/social-media friendly MP4: H.264 video at a
// constant 30 fps plus AAC audio, with the index up front so it starts playing at once.
// Instagram, WhatsApp and phones expect this; browsers often record WebM/VP8 instead.
//
// Preferred: the local RouteFly server converts with the system ffmpeg (see vite.config.js).
// Fallback, e.g. when the app is served as static files: convert in the browser, which
// only works where the browser can really encode H.264 (Chrome; not Firefox on Linux).
import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, Conversion, canEncodeAudio } from 'mediabunny';

export async function toMp4(blob, onStatus) {
  const started = performance.now();
  const ticker = setInterval(() => onStatus(`Converting to MP4… ${Math.round((performance.now() - started) / 1000)} s`), 1000);
  try {
    let res;
    try {
      res = await fetch('/api/mp4', { method: 'POST', body: blob });
    } catch {
      res = null; // no local server
    }
    if (res?.ok) return new Blob([await res.arrayBuffer()], { type: 'video/mp4' });
    if (res && res.status !== 404) throw new Error(await res.text());
  } finally {
    clearInterval(ticker);
  }
  return toMp4InBrowser(blob, (p) => onStatus(`Converting to MP4… ${Math.round(p * 100)}%`));
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
