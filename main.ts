// NUSA SKYWAYS — the hand-in program for the make.fun "best flight game" bounty.
// Node 22, standard library only. It takes this repository's game/ and
// screenshots/ and lays them out in the output directory the grader hands us
// (or MAKEFUN_OUTPUT_DIR when run by hand), then writes /output/dossier.json
// with the vendored make.fun library.
//
// The grader bind-mounts /output, so this program never deletes the output
// directory itself: it only empties what is inside it, entry by entry, and
// recreates the three things the gate expects. Before copying anything it
// checks the entry's own limits (at most 4 screenshots, each at most 256 KiB,
// a game/ folder that exists) and says so on stdout, so a bad repo fails loudly
// here instead of silently handing in a broken entry.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
import { buildDossier } from './vendor/makefun-game.ts';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 256 * 1024;
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 48 * 1024 * 1024;

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function countEntries(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += 1;
    if (entry.isDirectory()) total += countEntries(join(dir, entry.name));
  }
  return total;
}

function dirBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(path) : statSync(path).size;
  }
  return total;
}

function checkShots() {
  if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');
  const names = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length < 3) fail(`only ${names.length} screenshots, need 3 or 4`);
  if (names.length > MAX_SHOTS) fail(`${names.length} screenshots, at most ${MAX_SHOTS} allowed`);
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) fail(`screenshot name not allowed: ${name}`);
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SHOT_BYTES) fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
  }
  return names;
}

function checkGame() {
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const files = countEntries(gameDir);
  const bytes = dirBytes(gameDir);
  if (files > MAX_GAME_FILES) fail(`game/ has ${files} entries, over the 993 cap`);
  if (bytes > MAX_GAME_BYTES) fail(`game/ is ${bytes} bytes, over the 48 MiB cap`);
  return { files, bytes };
}

// --- validate first, copy second -------------------------------------------
const shotNames = checkShots();
const gameStats = checkGame();
console.log(`main.ts: game/ OK (${gameStats.files} entries, ${gameStats.bytes} bytes)`);
console.log(`main.ts: screenshots OK (${shotNames.join(', ')})`);

// Empty the output directory without removing it (it may be a bind mount).
mkdirSync(outputDir, { recursive: true });
for (const entry of readdirSync(outputDir)) {
  rmSync(join(outputDir, entry), { recursive: true, force: true });
}

cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// The dossier is built from the copied output, so it always matches the hand-in.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: MAX_SHOTS, max_bytes: MAX_SHOT_BYTES },
  game_max_files: MAX_GAME_FILES,
  game_max_bytes: MAX_GAME_BYTES,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
const written = statSync(join(outputDir, 'dossier.json')).size;
if (written !== dossier.length) fail('dossier.json on disk does not match what was built');
console.log(`main.ts: wrote ${join(outputDir, 'dossier.json')} (${written} bytes)`);
console.log('main.ts: done.');
