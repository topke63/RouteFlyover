// Output targets for finished videos. Where the browser supports it (OPFS), the muxer writes
// straight to a scratch file on disk, so a long render isn't held in RAM; the result is a
// file-backed Blob that later stages read lazily. Elsewhere it falls back to an in-memory buffer.
import { BufferTarget, StreamTarget } from 'mediabunny';

const PREFIX = 'render-';
let counter = 0;

// Delete scratch files left by earlier renders. Call only when none of them is still needed.
export async function purgeScratch() {
  try {
    const dir = await navigator.storage.getDirectory();
    for await (const name of dir.keys()) {
      if (name.startsWith(PREFIX)) await dir.removeEntry(name).catch(() => {});
    }
  } catch { /* no OPFS */ }
}

// → { target, result() }; result() resolves to the finished video as a Blob of type `mime`.
export async function createTarget(mime) {
  try {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle(`${PREFIX}${Date.now()}-${counter++}`, { create: true });
    const writable = await handle.createWritable();
    return {
      target: new StreamTarget(writable, { chunked: true }),
      result: async () => (await handle.getFile()).slice(0, undefined, mime),
    };
  } catch {
    const target = new BufferTarget();
    return { target, result: async () => new Blob([target.buffer], { type: mime }) };
  }
}
