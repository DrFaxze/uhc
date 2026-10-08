// Comprobaciones estáticas de build/: JSON válido, referencias de geometría / animación / textura /
// render controller resueltas, UUID de manifiestos únicos y modelos usados por el script existentes.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BP = path.join(ROOT, 'build', 'BP');
const RP = path.join(ROOT, 'build', 'RP');
const errors = [];
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

const json = new Map();
for (const f of [...walk(BP), ...walk(RP)].filter((f) => f.endsWith('.json'))) {
  try {
    json.set(f, JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (e) {
    errors.push(`JSON inválido: ${path.relative(ROOT, f)}: ${e.message}`);
  }
}

const geometries = new Set();
const animations = new Set();
const controllers = new Set();
const renderControllers = new Set(['controller.render.default']);
for (const [f, d] of json) {
  for (const g of d['minecraft:geometry'] ?? []) geometries.add(g.description.identifier);
  for (const k of Object.keys(d.animations ?? {})) if (f.includes(`${path.sep}animations${path.sep}`)) animations.add(k);
  for (const k of Object.keys(d.animation_controllers ?? {})) controllers.add(k);
  for (const k of Object.keys(d.render_controllers ?? {})) renderControllers.add(k);
}

const bpIds = new Set();
for (const [f, d] of json) {
  const e = d['minecraft:entity'];
  if (e) bpIds.add(e.description.identifier);
}

for (const [f, d] of json) {
  const c = d['minecraft:client_entity'];
  if (!c) continue;
  const desc = c.description;
  const rel = path.relative(ROOT, f);
  if (desc.identifier.startsWith('improvedragon:') && !bpIds.has(desc.identifier)) errors.push(`${rel}: sin entidad de comportamiento ${desc.identifier}`);
  for (const g of Object.values(desc.geometry ?? {})) {
    if (g.startsWith('geometry.improvedragon') && !geometries.has(g)) errors.push(`${rel}: falta ${g}`);
  }
  for (const t of Object.values(desc.textures ?? {})) {
    if (t.includes('improvedragon') && !fs.existsSync(path.join(RP, `${t}.png`))) errors.push(`${rel}: falta textura ${t}`);
  }
  for (const a of Object.values(desc.animations ?? {})) {
    if (!a.includes('improvedragon')) continue;
    if (!animations.has(a) && !controllers.has(a)) errors.push(`${rel}: falta animación ${a}`);
  }
  for (const rc of desc.render_controllers ?? []) {
    const id = typeof rc === 'string' ? rc : Object.keys(rc)[0];
    if (id.includes('improvedragon') && !renderControllers.has(id)) errors.push(`${rel}: falta render controller ${id}`);
  }
}

// Controladores: cada animación de estado debe estar declarada en su entidad (lo garantiza gen.mjs).
const uuids = [];
for (const m of [path.join(BP, 'manifest.json'), path.join(RP, 'manifest.json')]) {
  const d = json.get(m);
  if (!d) {
    errors.push(`falta ${m}`);
    continue;
  }
  uuids.push(d.header.uuid, ...d.modules.map((x) => x.uuid));
}
if (new Set(uuids).size !== uuids.length) errors.push('UUID repetidos en los manifiestos');
if (!fs.existsSync(path.join(BP, 'scripts', 'main.js'))) errors.push('falta build/BP/scripts/main.js');

// Modelos citados desde el código del script.
const models = new Set(
  [...walk(path.join(RP, 'entity'))].map((f) => path.basename(f).replace('.entity.json', '').replace(/^improvedragon_/, '')),
);
for (const f of walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.includes('generated'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:fx|spawn|spawnCentered|spawnTarget)\(\s*'([a-z_0-9]+)'/g)) {
    if (!models.has(m[1])) errors.push(`${path.relative(ROOT, f)}: modelo desconocido '${m[1]}'`);
  }
}

if (errors.length) {
  console.error(`validate: ${errors.length} error(es)\n` + errors.join('\n'));
  process.exit(1);
}
console.log(`validate: ok (${json.size} JSON, ${geometries.size} geometrías, ${animations.size} animaciones, ${bpIds.size} entidades)`);
