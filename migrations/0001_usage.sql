-- Esri map tiles used per calendar month (UTC), as reported by the app; see worker/index.js.
CREATE TABLE usage (
  month TEXT PRIMARY KEY,          -- e.g. 2026-10
  tiles INTEGER NOT NULL DEFAULT 0,
  renders INTEGER NOT NULL DEFAULT 0
);
