// Crea dist/ImproveDragon.mcaddon (BP + RP) a partir de build/.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zip = new JSZip();
function add(dir, prefix) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) add(p, `${prefix}/${e.name}`);
    else zip.file(`${prefix}/${e.name}`, fs.readFileSync(p));
  }
}
add(path.join(ROOT, 'build', 'BP'), 'ImproveDragon_BP');
add(path.join(ROOT, 'build', 'RP'), 'ImproveDragon_RP');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'ImproveDragon.mcaddon');
fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`pack: ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KiB)`);
