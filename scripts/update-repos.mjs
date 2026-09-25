// Holt für jede App aus apps.json die Eckdaten ihres GitHub-Repos und schreibt sie
// nach data/repos.json. Läuft täglich als GitHub Action, lokal: node scripts/update-repos.mjs
import { readFile, writeFile } from 'node:fs/promises';

const apps = JSON.parse(await readFile(new URL('../apps.json', import.meta.url)));
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'ericwinderlich.de' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res;
}

const out = {};
for (const app of apps) {
  const m = (app.github || '').match(/github\.com\/([^/]+)\/([^/#?]+)/);
  if (!m) continue;
  const repo = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
  try {
    const info = await (await gh(`/repos/${repo}`)).json();
    // Anzahl Commits: eine Seite mit je 1 Commit anfordern, die letzte Seitenzahl ist die Anzahl
    const commitsRes = await gh(`/repos/${repo}/commits?per_page=1`);
    const last = (commitsRes.headers.get('link') || '').match(/[?&]page=(\d+)>; rel="last"/);
    const commits = last ? Number(last[1]) : (await commitsRes.json()).length;
    out[app.id] = { pushed: info.pushed_at, created: info.created_at, commits };
  } catch (err) {
    console.warn(`Übersprungen: ${app.id} (${err.message})`);
  }
}

await writeFile(new URL('../data/repos.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`data/repos.json: ${Object.keys(out).length} Repos`);
