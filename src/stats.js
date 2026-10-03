const MOVING_SPEED = 0.8;   // m/s; slower segments count as stopped
const MAX_SPEED_WINDOW = 15e3; // ms; max speed is averaged over this to ignore GPS spikes

// Trip summary as [label, value] rows; time-based rows only when the GPX has timestamps.
export function tripStats(track, photoCount) {
  const rows = [];
  if (track.hasTime) {
    rows.push(['Date', new Date(track.time[0]).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })]);
  }
  rows.push(['Distance', fmtKm(track.total)]);

  if (track.hasTime) {
    const { time, cum } = track;
    let moving = 0;
    for (let i = 1; i < time.length; i++) {
      const dt = time[i] - time[i - 1];
      if (dt > 0 && (cum[i] - cum[i - 1]) / (dt / 1000) > MOVING_SPEED) moving += dt;
    }
    let maxSpeed = 0;
    for (let i = 0, j = 0; i < time.length; i++) {
      while (j < time.length - 1 && time[j] - time[i] < MAX_SPEED_WINDOW) j++;
      const dt = (time[j] - time[i]) / 1000;
      if (dt >= MAX_SPEED_WINDOW / 1000) maxSpeed = Math.max(maxSpeed, (cum[j] - cum[i]) / dt);
    }
    rows.push(
      ['Total time', fmtDuration(track.duration)],
      ['Moving time', fmtDuration(moving)],
      ['Avg speed', moving ? fmtSpeed(track.total / (moving / 1000)) : '—'],
      ['Max speed', maxSpeed ? fmtSpeed(maxSpeed) : '—'],
    );
  }

  rows.push(
    ['Climb', `${Math.round(track.gain)} m`],
    ['Descent', `${Math.round(track.loss)} m`],
    ['Highest point', `${Math.round(Math.max(...track.ele))} m`],
    ['Lowest point', `${Math.round(Math.min(...track.ele))} m`],
  );
  if (photoCount) rows.push(['Photos', String(photoCount)]);
  return rows;
}

export function fmtKm(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10e3 ? 2 : 1)} km`;
}

export function fmtDuration(ms) {
  const min = Math.round(ms / 60e3);
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

const fmtSpeed = (ms) => `${(ms * 3.6).toFixed(1)} km/h`;
