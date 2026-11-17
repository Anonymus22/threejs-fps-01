// BREAKLINE — hand-in program for the threejs-fps-01 entry (Node 22, standard library only).
// The game lives in this directory's game/ folder: plain static files the browser loads as ES
// modules, three.js 0.187.0 vendored under game/vendor/three/ and reached through the import
// map in game/index.html. This program copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json — the summary the judge reads — with buildDossier
// from the vendored vendor/makefun-threejs.ts, byte for byte the library's own output.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps, passed to buildDossier so the dossier it writes is the one the gate
// rebuilds: text capped at 163,840 bytes; at most 4 screenshots of at most 256 KiB each; game/
// at most 993 files and 48 MiB — game/ counts beside /output's own 1,000-entry cap, which its
// screenshots/ and dossier.json share.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
