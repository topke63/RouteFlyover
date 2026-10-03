// Background music: a playlist played back to back at normal speed with crossfades,
// repeating if it is shorter than the video, faded out at the end.
//
// The preview plays it live. A recording is made silently; once its exact length is
// known, the soundtrack is rendered offline to that length and muxed in (see addSoundtrack).
import {
  Input, BlobSource, ALL_FORMATS, EncodedPacketSink, Output, BufferTarget,
  WebMOutputFormat, Mp4OutputFormat, EncodedVideoPacketSource, AudioBufferSource, canEncodeAudio,
} from 'mediabunny';

const CROSSFADE = 2;        // s between consecutive songs
const FADE_IN = 0.6;        // s at the very start
const FADE_OUT = 4.2;       // s at the end
const END_SILENCE = 0.3;    // s of silence before the last frame
const SCHEDULE_AHEAD = 15;  // s of playlist the live player keeps queued
const SAMPLE_RATE = 48000;

export const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;

// Queue playlist songs onto `out` until time `until`. `state` ({ next, at }) remembers
// which song comes next and when it starts, so this can be called repeatedly.
function queueSongs(ctx, out, songs, state, until) {
  while (state.at < until) {
    const { buffer } = songs[state.next % songs.length];
    const start = state.at, end = start + buffer.duration;
    const fade = Math.min(CROSSFADE, buffer.duration / 3);
    const first = state.next === 0; // the overall fade-in covers the very first song
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(first ? 1 : 0, start);
    if (!first) gain.gain.linearRampToValueAtTime(1, start + fade);
    gain.gain.setValueAtTime(1, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain).connect(out);
    src.start(start);
    state.next++;
    state.at = end - fade; // the next song overlaps this one's fade-out
  }
}

export class Music {
  constructor() {
    this.songs = []; // { name, buffer }
    this.volume = 0.8;
  }

  get duration() {
    return this.songs.reduce((s, x) => s + x.buffer.duration, 0);
  }

  async add(files) {
    // A throwaway context is enough to decode; playback uses its own.
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const failed = [];
    for (const file of files) {
      try {
        this.songs.push({ name: file.name, buffer: await ctx.decodeAudioData(await file.arrayBuffer()) });
      } catch {
        failed.push(file.name);
      }
    }
    ctx.close();
    return failed;
  }

  remove(i) {
    this.songs.splice(i, 1);
  }

  // ---------- Live preview ----------

  start() {
    this.stop();
    if (!this.songs.length) return;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + FADE_IN);
    this.master.connect(ctx.destination);
    this.queue = { next: 0, at: ctx.currentTime + 0.05 };
    this.fading = false;
    this.update();
  }

  // Keep the playlist queued ahead of the playhead; call regularly (every frame is fine).
  update() {
    if (this.ctx && !this.fading) queueSongs(this.ctx, this.master, this.songs, this.queue, this.ctx.currentTime + SCHEDULE_AHEAD);
  }

  // Freeze/unfreeze with the animation clock.
  setRunning(running) {
    const { ctx } = this;
    if (!ctx || ctx.state === 'closed') return;
    if (running && ctx.state === 'suspended') ctx.resume();
    else if (!running && ctx.state === 'running') ctx.suspend();
  }

  // Smoothly fade to silence: hold for `delay` seconds, then fade over `duration`.
  fadeOut(duration = FADE_OUT, delay = 0) {
    const { ctx, master } = this;
    if (!ctx) return;
    this.fading = true;
    const now = ctx.currentTime, value = master.gain.value;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(value, now);
    master.gain.setValueAtTime(value, now + delay);
    master.gain.linearRampToValueAtTime(0, now + delay + duration);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && !this.fading) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  stop() {
    this.ctx?.close();
    this.ctx = null;
  }

  // ---------- Final soundtrack ----------

  // The playlist rendered to exactly `duration` seconds, ending in a smooth fade-out.
  async render(duration) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
    const master = ctx.createGain();
    const fadeEnd = Math.max(FADE_IN, duration - END_SILENCE);
    const fadeStart = Math.max(FADE_IN, fadeEnd - FADE_OUT);
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(this.volume, FADE_IN);
    master.gain.setValueAtTime(this.volume, fadeStart);
    master.gain.linearRampToValueAtTime(0, fadeEnd);
    master.connect(ctx.destination);
    queueSongs(ctx, master, this.songs, { next: 0, at: 0 }, duration);
    return ctx.startRendering();
  }
}

// Mux a rendered soundtrack into a recorded video. The video packets are copied as-is
// (no re-encoding); only the audio is encoded. Returns the new file and its duration.
export async function addSoundtrack(videoBlob, music) {
  const input = new Input({ source: new BlobSource(videoBlob), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const duration = await input.computeDuration();
  const soundtrack = await music.render(duration);

  const mp4 = videoBlob.type.includes('mp4');
  const audioCodec = mp4 && (await canEncodeAudio('aac')) ? 'aac' : 'opus';
  const output = new Output({ format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target: new BufferTarget() });
  const videoOut = new EncodedVideoPacketSource(video.codec);
  const audioOut = new AudioBufferSource({ codec: audioCodec, bitrate: 192e3 });
  output.addVideoTrack(videoOut);
  output.addAudioTrack(audioOut);
  await output.start();

  // Feed both tracks at once so the muxer can interleave them.
  const copyVideo = async () => {
    const decoderConfig = await video.getDecoderConfig();
    let first = true, last = -Infinity;
    for await (let packet of new EncodedPacketSink(video).packets()) {
      // MediaRecorder stamps frames in whole milliseconds, so two frames can share one;
      // nudge those apart (recorded frames have no B-frames, so order is display order).
      if (packet.timestamp <= last) packet = packet.clone({ timestamp: last + 0.001 });
      last = packet.timestamp;
      await videoOut.add(packet, first ? { decoderConfig } : undefined);
      first = false;
    }
    videoOut.close();
  };
  const addAudio = async () => {
    await audioOut.add(soundtrack);
    audioOut.close();
  };
  await Promise.all([copyVideo(), addAudio()]);
  await output.finalize();
  return { blob: new Blob([output.target.buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }), duration };
}
