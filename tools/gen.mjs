// Los archivos de cliente van en la raíz de cada carpeta (sin subcarpetas): Bedrock no siempre las recorre.
// Genera los packs completos en build/BP y build/RP:
//  - copia los archivos escritos a mano de packs/BP y packs/RP;
//  - convierte cada modelo de assets-src (formato Bedrock que usaba GeckoLib) en una entidad de efecto
//    improvedragon:<modelo> (BP + RP + controladores de animación + render controller);
//  - escribe src/generated/models.ts con las animaciones y duraciones de cada modelo.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'build');
const BP = path.join(OUT, 'BP');
const RP = path.join(OUT, 'RP');
const NS = 'improvedragon';

// Modelos que se pintan con mezcla aditiva (ModelCatalog.ADDITIVE de la versión Java).
const ADDITIVE = new Set([
  'blood_line', 'blood_rise', 'charge_rings_purple', 'charge_rings_red', 'crystal_condense', 'death_beam_mark',
  'eclipse_dash', 'electrified_ground', 'end_lightning', 'end_lightning_mark', 'enderbeam', 'enderbeam_impact',
  'enderbeam_mark', 'fear_burst', 'fear_core', 'fear_crystal', 'fear_link', 'fear_runes', 'final_judgment_column',
  'heal_beam', 'heal_tally', 'intercept_beam', 'intercept_burst', 'intercept_cross', 'judgment_column', 'moon_tear',
  'pearl_portal', 'rapture', 'requiem_charge', 'requiem_orb', 'requiem_resonance', 'rite_crystal', 'rite_link',
  'rite_projectile', 'ruin_link', 'ruin_shield', 'rush_aura', 'shockwave_purple', 'shockwave_red', 'sonic_beam',
  'sonic_charge', 'sonic_impact', 'sonic_target',
]);

// Efectos que se pueden golpear (TargetEntity): caja [ancho, alto] de la versión Java.
const TARGETS = {
  eclipse_moon: [7, 7],
  crimson_crystal: [4, 7],
  rift: [3, 8],
  dim_rift: [4, 9],
  rite_crystal: [4, 6],
  rite_projectile: [3, 3],
  frost_prism: [2.5, 2.5],
  ruin_heart: [13, 26],
  blood_moon: [24, 24],
  moon_tear: [2, 5],
  constellation_crystal: [2, 2],
  fear_crystal: [2, 2],
  fear_core: [3, 3],
  frost_bullet: [0.4, 0.4],
};

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
};
const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(a, b);
    }
  }
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const prop = (name) => `q.property('${NS}:${name}')`;

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'packs', 'BP'), BP);
copyDir(path.join(ROOT, 'packs', 'RP'), RP);

const models = fs
  .readdirSync(path.join(SRC, 'geo'))
  .filter((f) => f.endsWith('.geo.json'))
  .map((f) => f.replace('.geo.json', ''))
  .sort();

const catalog = {};
const lang = [];

for (const name of models) {
  // --- Geometría: identificador propio y hueso raíz "idfx_aim" que orienta y escala todo el modelo.
  const geo = readJson(path.join(SRC, 'geo', `${name}.geo.json`));
  const g = geo['minecraft:geometry'][0];
  g.description.identifier = `geometry.${NS}.${name}`;
  let ext = 1;
  for (const b of g.bones) {
    if (!b.parent) b.parent = 'idfx_aim';
    for (const c of b.cubes ?? []) {
      for (let i = 0; i < 3; i++) {
        ext = Math.max(ext, Math.abs(c.origin[i]), Math.abs(c.origin[i] + c.size[i]));
      }
    }
  }
  g.bones.unshift({ name: 'idfx_aim', pivot: [0, 0, 0] });
  const extBlocks = ext / 16;
  const bound = Math.min(512, Math.max(g.description.visible_bounds_width ?? 1, extBlocks * 2) * 6);
  g.description.visible_bounds_width = bound;
  g.description.visible_bounds_height = bound;
  g.description.visible_bounds_offset = [0, 0, 0];
  write(path.join(RP, 'models', 'entity', `${NS}_${name}.geo.json`), geo);

  // --- Animaciones: se renombran y se guardan nombres y duraciones para el script.
  const anim = readJson(path.join(SRC, 'animations', `${name}.animation.json`));
  const renamed = {};
  const anims = [];
  const lengths = [];
  const loops = [];
  for (const [key, a] of Object.entries(anim.animations)) {
    const short = key.split('.').slice(2).join('.');
    anims.push(short);
    lengths.push(Math.round((a.animation_length ?? 0) * 20));
    loops.push(a.loop === true);
    renamed[`animation.${NS}.${name}.${short}`] = a;
  }
  write(path.join(RP, 'animations', `${NS}_${name}.animation.json`), { format_version: '1.8.0', animations: renamed });

  // --- Textura (las animadas con .mcmeta usan uv_anim en el render controller).
  const tex = path.join(SRC, 'textures', `${name}.png`);
  fs.mkdirSync(path.join(RP, 'textures', 'entity', NS), { recursive: true });
  fs.copyFileSync(tex, path.join(RP, 'textures', 'entity', NS, `${name}.png`));
  let frames = 0;
  let frametime = 1;
  const meta = path.join(SRC, 'textures', `${name}.mcmeta`);
  if (fs.existsSync(meta)) {
    const png = fs.readFileSync(tex);
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    frames = Math.max(1, Math.round(h / w / (g.description.texture_height / g.description.texture_width)));
    frametime = readJson(meta).animation?.frametime ?? 1;
  }

  // --- Controladores: 3 ranuras como las cadenas de GeckoLib; el script elige la animación por propiedad.
  const controllers = {};
  const clientAnims = { aim: `animation.${NS}.fx_aim` };
  anims.forEach((a, i) => (clientAnims[`a${i}`] = `animation.${NS}.${name}.${a}`));
  for (let slot = 0; slot < 3; slot++) {
    const p = prop(`a${slot}`);
    const states = {
      default: { transitions: anims.map((_, i) => ({ [`s${i}`]: `${p} == ${i}` })) },
    };
    anims.forEach((_, i) => {
      states[`s${i}`] = { animations: [`a${i}`], transitions: [{ default: `${p} != ${i}` }] };
    });
    const id = `controller.animation.${NS}.${name}.slot${slot}`;
    controllers[id] = { initial_state: 'default', states };
    clientAnims[`slot${slot}`] = id;
  }
  write(path.join(RP, 'animation_controllers', `${NS}_${name}.animation_controllers.json`), {
    format_version: '1.10.0',
    animation_controllers: controllers,
  });

  const rc = {
    geometry: 'Geometry.default',
    materials: [{ '*': 'Material.default' }],
    textures: ['Texture.default'],
    ignore_lighting: true,
  };
  if (frames > 1) {
    rc.uv_anim = {
      offset: [0, `math.floor(q.life_time * 20 / ${frametime}) % ${frames} / ${frames}`],
      scale: [1, `1 / ${frames}`],
    };
  }
  write(path.join(RP, 'render_controllers', `${NS}_${name}.render_controllers.json`), {
    format_version: '1.10.0',
    render_controllers: { [`controller.render.${NS}.${name}`]: rc },
  });

  write(path.join(RP, 'entity', `${NS}_${name}.entity.json`), {
    format_version: '1.10.0',
    'minecraft:client_entity': {
      description: {
        identifier: `${NS}:${name}`,
        materials: { default: ADDITIVE.has(name) ? 'entity_beam_additive' : 'entity_alphablend' },
        textures: { default: `textures/entity/${NS}/${name}` },
        geometry: { default: `geometry.${NS}.${name}` },
        animations: clientAnims,
        scripts: { animate: ['aim', 'slot0', 'slot1', 'slot2'] },
        render_controllers: [`controller.render.${NS}.${name}`],
      },
    },
  });

  // --- Comportamiento: entidad sin IA ni colisión; las golpeables tienen caja de golpe y vida "infinita".
  const target = TARGETS[name];
  const props = {};
  for (let slot = 0; slot < 3; slot++) {
    props[`${NS}:a${slot}`] = { type: 'int', range: [-1, Math.max(0, anims.length - 1)], default: -1, client_sync: true };
  }
  // Enteros en coma fija (valor × 100): las propiedades float no llegan bien al cliente y el modelo
  // quedaba con escala 0 (invisible).
  props[`${NS}:pitch`] = { type: 'int', range: [-18000, 18000], default: 0, client_sync: true };
  for (const k of ['sx', 'sy', 'sz']) props[`${NS}:${k}`] = { type: 'int', range: [0, 200000], default: 100, client_sync: true };
  props[`${NS}:dy`] = { type: 'int', range: [-50000, 50000], default: 0, client_sync: true };
  const components = {
    'minecraft:physics': { has_gravity: false, has_collision: false },
    'minecraft:knockback_resistance': { value: 1 },
    'minecraft:fire_immune': {},
    'minecraft:collision_box': { width: 0.2, height: 0.2 },
    'minecraft:type_family': { family: target ? [`${NS}_fx`, `${NS}_target`, 'inanimate'] : [`${NS}_fx`, 'inanimate'] },
    'minecraft:conditional_bandwidth_optimization': {
      default_values: { max_optimized_distance: 0, max_dropped_ticks: 0, use_motion_prediction_hints: true },
    },
  };
  if (target) {
    const [w, h] = target;
    components['minecraft:health'] = { value: 1000000, max: 1000000 };
    components['minecraft:custom_hit_test'] = { hitboxes: [{ pivot: [0, h / 2, 0], width: w, height: h }] };
  } else {
    components['minecraft:health'] = { value: 1, max: 1 };
    components['minecraft:damage_sensor'] = { triggers: { cause: 'all', deals_damage: 'no' } };
    components['minecraft:custom_hit_test'] = { hitboxes: [{ pivot: [0, -1000, 0], width: 0, height: 0 }] };
  }
  write(path.join(BP, 'entities', NS, `${name}.json`), {
    format_version: '1.21.0',
    'minecraft:entity': {
      description: { identifier: `${NS}:${name}`, is_spawnable: false, is_summonable: true, properties: props },
      components,
    },
  });

  catalog[name] = { anims, lengths, loops, additive: ADDITIVE.has(name), target: target ?? null };
  lang.push(`entity.${NS}:${name}.name=${name}`);
}

// Animación común que orienta y escala el hueso raíz.
write(path.join(RP, 'animations', `${NS}_fx_aim.animation.json`), {
  format_version: '1.8.0',
  animations: {
    [`animation.${NS}.fx_aim`]: {
      loop: true,
      bones: {
        idfx_aim: {
          rotation: [`${prop('pitch')} / 100`, 0, 0],
          position: [0, `${prop('dy')} * 0.16`, 0],
          scale: [`${prop('sx')} / 100`, `${prop('sy')} / 100`, `${prop('sz')} / 100`],
        },
      },
    },
  },
});

// Catálogo para el script.
const ts = [
  '// Generado por tools/gen.mjs: no editar a mano.',
  'export interface ModelInfo { anims: string[]; lengths: number[]; loops: boolean[]; additive: boolean; target: [number, number] | null }',
  `export const MODELS: Record<string, ModelInfo> = ${JSON.stringify(catalog, null, 1)};`,
  '',
].join('\n');
write(path.join(ROOT, 'src', 'generated', 'models.ts'), ts);

// Nombres de entidad (los efectos no se ven en el juego, pero así no salen claves crudas).
for (const file of ['en_US.lang', 'es_ES.lang']) {
  const p = path.join(RP, 'texts', file);
  const base = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  write(p, base + (base.endsWith('\n') || !base ? '' : '\n') + lang.join('\n') + '\n');
}


console.log(`gen: ${models.length} modelos -> ${path.relative(ROOT, OUT)}`);
