#!/usr/bin/env node
// Uploads the release (dist/index.html) to Playable Studio.
//
//   npm run release                       build + upload
//   npm run release -- --notes "new CTA"  with release notes
//   PLAYABLE_STUDIO=https://studio.example.com npm run release
//
// PLAYABLE_STUDIO_TOKEN: a publish token from the Studio (`npm run users -- token <name>` there).
// Put both in .env.local (not committed) or in the CI secrets.

import fs from "node:fs";

const studio = (process.env.PLAYABLE_STUDIO || "http://localhost:5300").replace(/\/$/, "");
const token = process.env.PLAYABLE_STUDIO_TOKEN;
const args = process.argv.slice(2);
const notesAt = args.findIndex((a) => a === "--notes" || a.startsWith("--notes="));
const notes =
  notesAt < 0
    ? ""
    : args[notesAt].includes("=")
    ? args[notesAt].split("=").slice(1).join("=")
    : args[notesAt + 1] ?? "";
const file = "dist/index.html";

if (!fs.existsSync(file)) {
  console.error(`${file} not found — run "npm run build" first.`);
  process.exit(1);
}

try {
  const res = await fetch(`${studio}/api/releases?notes=${encodeURIComponent(notes)}`, {
    method: "POST",
    headers: { "content-type": "text/html", ...(token && { authorization: `Bearer ${token}` }) },
    body: fs.readFileSync(file, "utf8")
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401)
    throw new Error(
      token
        ? "the Studio rejected PLAYABLE_STUDIO_TOKEN"
        : "set PLAYABLE_STUDIO_TOKEN (a publish token from the Studio)"
    );
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  const { game, release, created } = body;
  console.log(
    created
      ? `✓ ${game.title}: release r${release.number} uploaded`
      : `= ${game.title}: this build is already release r${release.number}`
  );
  console.log(`  ${studio}/#/g/${encodeURIComponent(game.id)}`);
} catch (error) {
  console.error(
    `Upload to ${studio} failed: ${error.cause?.code === "ECONNREFUSED" ? "Studio is not running" : error.message}`
  );
  process.exit(1);
}
