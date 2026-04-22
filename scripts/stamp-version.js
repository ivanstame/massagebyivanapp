#!/usr/bin/env node

// Writes build/version.json with an identifier for the current deploy.
// Reads the commit SHA from the env when running on Heroku; falls back to a
// timestamp for local builds. The server exposes this via /api/version so
// clients can detect when a new deploy is live and prompt a refresh.

const fs = require('fs');
const path = require('path');

const version = (
  process.env.HEROKU_SLUG_COMMIT
  || process.env.SOURCE_VERSION
  || process.env.COMMIT_SHA
  || `local-${Date.now()}`
).substring(0, 12);

const payload = {
  version,
  buildTime: new Date().toISOString(),
};

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  console.error(`stamp-version: build/ does not exist at ${buildDir}`);
  process.exit(1);
}

const outPath = path.join(buildDir, 'version.json');
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`stamp-version: wrote ${outPath} with version ${version}`);
