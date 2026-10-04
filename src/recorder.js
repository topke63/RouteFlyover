// Frame-by-frame video encoder: each call to frame() composites the map canvas and the
// overlay canvas and encodes them as the next frame, stamped at exactly frame / FPS seconds.
// Rendering can take as long as it needs (waiting for map tiles, slow machines) — the
// video still plays back smoothly at FPS with the exact length of the animation timeline.
// Requires the map to be created with preserveDrawingBuffer: true.
import { Output, BufferTarget, WebMOutputFormat, CanvasSource } from 'mediabunny';

export const FPS = 30;

export class Recorder {
  constructor(source, overlay) {
    this.source = source;
    this.overlay = overlay;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  async start() {
    // Encoders want even dimensions.
    this.canvas.width = this.source.width & ~1;
    this.canvas.height = this.source.height & ~1;
    this.output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    // VP8: encodes faster than real time at 1080p in every browser; the MP4 export
    // re-encodes to H.264 anyway, so the generous bitrate keeps this intermediate clean.
    // Realtime mode keeps the encoder ahead of the renderer (~20% faster renders in Firefox).
    this.video = new CanvasSource(this.canvas, { codec: 'vp8', bitrate: 16e6, keyFrameInterval: 2, latencyMode: 'realtime' });
    this.output.addVideoTrack(this.video, { frameRate: FPS });
    await this.output.start();
    this.frames = 0;
  }

  // Resolves when the encoder is ready for the next frame.
  async frame() {
    const { ctx, canvas } = this;
    ctx.drawImage(this.source, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.overlay, 0, 0, canvas.width, canvas.height);
    await this.video.add(this.frames / FPS, 1 / FPS);
    this.frames++;
  }

  async stop() {
    await this.output.finalize();
    return { blob: new Blob([this.output.target.buffer], { type: 'video/webm' }), ext: 'webm' };
  }

  cancel() {
    this.output.cancel();
  }
}
