import fixWebmDuration from 'fix-webm-duration';

// Records the map canvas with the overlay canvas (HUD, photos) on top into a video file.
// Requires the map to be created with preserveDrawingBuffer: true.
const MIME_TYPES = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];

export class Recorder {
  constructor(source, overlay) {
    this.source = source;
    this.overlay = overlay;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  start(fps = 30) {
    // Encoders want even dimensions.
    this.canvas.width = this.source.width & ~1;
    this.canvas.height = this.source.height & ~1;
    this.mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.chunks = [];
    this.rec = new MediaRecorder(this.canvas.captureStream(fps), {
      mimeType: this.mimeType || undefined,
      videoBitsPerSecond: 10e6,
    });
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.activeMs = 0;
    this.since = performance.now();
  }

  get paused() {
    return this.rec.state === 'paused';
  }

  // Pausing leaves no gap in the output: used while waiting for map tiles.
  pause() {
    if (this.rec.state !== 'recording') return;
    this.rec.pause();
    this.activeMs += performance.now() - this.since;
  }

  resume() {
    if (this.rec.state !== 'paused') return;
    this.rec.resume();
    this.since = performance.now();
  }

  frame() {
    const { ctx, canvas } = this;
    ctx.drawImage(this.source, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.overlay, 0, 0, canvas.width, canvas.height);
  }

  stop() {
    if (this.rec.state === 'recording') this.activeMs += performance.now() - this.since;
    return new Promise((resolve) => {
      this.rec.onstop = async () => {
        const type = this.rec.mimeType || 'video/webm';
        let blob = new Blob(this.chunks, { type });
        // MediaRecorder's WebM has no duration header, which breaks seeking in players.
        if (type.includes('webm')) blob = await fixWebmDuration(blob, this.activeMs, { logger: false });
        resolve({ blob, ext: type.includes('mp4') ? 'mp4' : 'webm' });
      };
      this.rec.stop();
    });
  }
}
