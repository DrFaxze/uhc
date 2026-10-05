import { world } from '@minecraft/server';
import { C } from '../config';
import { push, trueDamage } from '../core/damage';
import { dust, end, groundAt, particle, PART, sound, validPlayer, COLORS } from '../core/world';
import { Effect } from '../fx/effect';
import { rand } from '../util/rand';
import { V } from '../util/vec';
import { Brain, brainOf, DEATH_HOOK } from '../boss/brain';

/**
 * Último Aliento (LastBreathEntity de Java): al recibir el golpe letal el dragón se desvanece, una luna
 * negra se forma sobre el podio en cuatro cuartos, los pilares se alzan, todo es atraído hacia el centro
 * y a los 35 s estalla con daño letal en LAST_BREATH_RADIUS. Luego los fragmentos orbitan y se desvanecen,
 * y el dragón muere de verdad (portal, huevo, experiencia).
 */
const FORM = 60;
const PHASES = [160, 280, 400, 520];
const MAX = 580;
const EXPLODE = 700;
const ORBIT = 800;
const VANISH = 960;
const END = 1000;
const MOON_HEIGHT = 60;
const PILLAR_LIFE = 134;

const KEY = 'improvedragon:last_breath';

interface Saved {
  age: number;
  c: [number, number, number];
  dragon: string;
  /** La cronología terminó y ya se pidió la muerte vanilla. */
  done: boolean;
}

interface Run {
  age: number;
  c: V;
  dragon: string;
  brain: Brain | null;
  moon: Effect | null;
  rim: Effect | null;
  pillars: Effect[];
  pillarsUp: boolean;
  others: Effect[];
}

let run: Run | null = null;
let doneFor: string | null = null;
let loaded = false;

// ---------------------------------------------------------------------------------------------------------
// Guardado (propiedad dinámica del mundo)

function load(): void {
  if (loaded) return;
  loaded = true;
  let raw: unknown;
  try {
    raw = world.getDynamicProperty(KEY);
  } catch {
    loaded = false;
    return;
  }
  if (typeof raw !== 'string') return;
  try {
    const s = JSON.parse(raw) as Saved;
    if (s.done) {
      doneFor = s.dragon;
      return;
    }
    run = { age: s.age, c: new V(s.c[0], s.c[1], s.c[2]), dragon: s.dragon, brain: null, moon: null, rim: null, pillars: [], pillarsUp: false, others: [] };
    log(`ultimo aliento: se reanuda en ${(s.age / 20).toFixed(1)} s`);
  } catch {
    /* dato corrupto: se ignora */
  }
}

function save(): void {
  try {
    if (run) {
      const s: Saved = { age: run.age, c: [run.c.x, run.c.y, run.c.z], dragon: run.dragon, done: false };
      world.setDynamicProperty(KEY, JSON.stringify(s));
    } else if (doneFor !== null) {
      const s: Saved = { age: END, c: [0, 0, 0], dragon: doneFor, done: true };
      world.setDynamicProperty(KEY, JSON.stringify(s));
    } else {
      world.setDynamicProperty(KEY, undefined);
    }
  } catch {
    /* ignorar */
  }
}

function log(msg: string): void {
  run?.brain?.log(msg);
}

// ---------------------------------------------------------------------------------------------------------
// API

export function registerLastBreath(): void {
  DEATH_HOOK.begin = (brain) => begin(brain);
}

function begin(brain: Brain): void {
  load();
  const id = brain.dragon.id;
  brain.setHidden(true);
  if (doneFor === id) {
    // Se recargó después del final: solo falta la muerte vanilla.
    brain.finishDeath();
    return;
  }
  if (run) {
    // Recarga a mitad (Brain.load vuelve a llamar a beginDeath): se reanuda, no se reinicia.
    if (run.dragon !== id) run.dragon = id;
    run.brain = brain;
    return;
  }
  doneFor = null;
  const c = brain.center();
  run = { age: 0, c, dragon: id, brain, moon: null, rim: null, pillars: [], pillarsUp: false, others: [] };
  // El dragón se desmorona donde estaba (y se oculta: el segundo efecto de Java con hideFollowed).
  const body = brain.position();
  spawn('last_breath_collapse', body, 'collapse', 1, 80, (fx) => run?.others.push(fx));
  sound(body, 'mob.wither.death', 12, 0.5);
  brain.log(`ultimo aliento en ${c}`);
  save();
}

export function tickLastBreath(): void {
  load();
  const r = run;
  if (!r) return;
  // Como la entidad de Java, solo avanza con el End cargado (algún jugador allí).
  let present = false;
  try {
    present = end().getPlayers().length > 0;
  } catch {
    present = false;
  }
  if (!present) return;
  if (r.brain && !r.brain.dragon.isValid) r.brain = null;
  r.age++;
  const age = r.age;
  const c = r.c;
  const moonAt = c.add(0, MOON_HEIGHT, 0);

  if (!r.moon && age >= FORM && age < END) {
    spawn('last_breath_moon', moonAt, moonState(age), 2.6, 0, (fx) => (r.moon = fx));
  }
  if (!r.rim && age >= FORM && age < EXPLODE) {
    spawn('last_breath_radius', c.add(0, -6, 0), age === FORM ? 'form>loop' : 'loop', C.LAST_BREATH_RADIUS / 8, 0, (fx) => (r.rim = fx.scaleY(6)));
  }
  if (!r.pillarsUp && age > MAX && age < MAX + PILLAR_LIFE - 12 && age < EXPLODE) {
    // Reanudado tras los pilares: vuelven con el tiempo que les quedaba.
    spawnPillars(r, MAX + PILLAR_LIFE - age);
  }
  if (age === FORM) top(c, 'beacon.activate', 12, 0.4);
  for (let i = 0; i < PHASES.length; i++) {
    if (age === PHASES[i] && r.moon) {
      r.moon.anims(`phase${i + 1}`);
      top(c, 'mob.warden.heartbeat', 12, 0.5 + i * 0.1);
      top(c, 'ambient.cave', 12, 0.5 + i * 0.15);
      log(`ultimo aliento: fase ${i + 1}`);
    }
  }
  if (age === MAX) {
    r.moon?.anims('max');
    spawnPillars(r, PILLAR_LIFE);
    top(c, 'beacon.power', 12, 0.5);
  }
  if (age > MAX && age < EXPLODE && age % 20 === 0) top(c, 'mob.warden.heartbeat', 12, 1);
  if (age >= FORM && age < EXPLODE) pull(age, c);
  if (age === EXPLODE) explode(r, c);
  if (age === EXPLODE + 50 && !deathSent.has(r.dragon)) {
    // Como en Java: la muerte vanilla (portal, huevo, experiencia) llega ~2,5 s después de la explosión.
    deathSent.add(r.dragon);
    r.brain?.finishDeath();
  }
  if (age === ORBIT) r.moon?.anims('orbit');
  if (age === VANISH) r.moon?.anims('vanish').life(40);
  if (age >= END) {
    finish(r);
    return;
  }
  if (age % 20 === 0 || age === EXPLODE) save();
}

// ---------------------------------------------------------------------------------------------------------
// Cronología

function moonState(age: number): string {
  if (age >= ORBIT) return 'orbit';
  if (age >= EXPLODE) return 'explode';
  if (age >= MAX) return 'max';
  for (let i = PHASES.length - 1; i >= 0; i--) if (age >= PHASES[i]) return `phase${i + 1}`;
  return 'form';
}

function spawn(model: string, at: V, anims: string, scale: number, life: number, then: (fx: Effect) => void): void {
  try {
    then(Effect.spawn(model, at, anims, scale, life));
  } catch {
    /* fuera de carga: se reintenta el tick siguiente si hace falta */
  }
}

/** Sonido unos 30 bloques sobre el centro (LastBreathEntity.sound). */
function top(c: V, id: string, volume: number, pitch: number): void {
  sound(c.add(0, 30, 0), id, volume, pitch);
}

function pull(age: number, c: V): void {
  const radius = C.LAST_BREATH_RADIUS;
  const k = (age - FORM) / (EXPLODE - FORM);
  const strength = C.LAST_BREATH_PULL * (0.25 + 0.75 * k);
  for (const player of end().getPlayers({ location: c, maxDistance: radius })) {
    if (!validPlayer(player)) continue;
    let d = new V(c.x - player.location.x, 0, c.z - player.location.z);
    if (d.lengthSqr() < 4) continue;
    d = d.normalize().scale(strength);
    push(player, d.x, 0, d.z);
  }
}

function spawnPillars(r: Run, life: number): void {
  r.pillarsUp = true;
  const n = C.LAST_BREATH_PILLARS;
  const c = r.c;
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n + rand.nextDouble() * 0.4;
    const radius = 18 + rand.nextDouble() * 45;
    const x = c.x + Math.cos(a) * radius;
    const z = c.z + Math.sin(a) * radius;
    const g = groundAt(x, z);
    if (g === null) continue;
    spawn('last_breath_pillar', new V(x, g, z), life === PILLAR_LIFE ? 'rise>loop' : 'loop', 1 + rand.nextFloat() * 0.6, life, (fx) => r.pillars.push(fx));
  }
}

function explode(r: Run, c: V): void {
  log('ultimo aliento: explosion');
  r.moon?.anims('explode');
  for (const p of r.pillars) if (p.valid) p.anims('fade').life(12);
  if (r.rim) {
    r.rim.anims('flare').life(12);
    r.others.push(r.rim);
    r.rim = null;
  }
  const radius = C.LAST_BREATH_RADIUS;
  // Anillos de explosiones (solo partículas, como en Java: no rompen bloques).
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (radius * ring) / 4;
    const n = 6 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n + ring;
      particle(PART.explosionEmitter, new V(c.x + Math.cos(a) * rr, c.y + 2, c.z + Math.sin(a) * rr));
    }
  }
  // Columna de luz hasta la luna.
  for (let i = 0; i < 24; i++) particle(PART.endRod, c.add((Math.random() - 0.5) * 6, 6 + Math.random() * 48, (Math.random() - 0.5) * 6), 1);
  dust(c.add(0, 30, 0), COLORS.white, 120, new V(3, 24, 3), 0.6);
  particle(PART.explosionEmitter, c.add(0, MOON_HEIGHT, 0), 3, 2);
  spawn('last_breath_wave', c.add(0, 0.3, 0), 'blast', radius / 8, 52, (fx) => {
    fx.scaleY(6);
    r.others.push(fx);
  });
  top(c, 'random.explode', 16, 0.3);
  top(c, 'mob.warden.sonic_boom', 16, 0.4);
  top(c, 'mob.enderdragon.death', 16, 0.6);
  top(c, 'ambient.weather.thunder', 16, 0.5);
  // Daño letal: la vida actual y mucho más, sin rebalanceo (el tótem de la inmortalidad salva).
  const source = r.brain?.dragon;
  for (const player of end().getPlayers({ location: c, maxDistance: radius })) {
    if (!validPlayer(player)) continue;
    const h = player.getComponent('minecraft:health')?.currentValue ?? 20;
    trueDamage(player, h + 100000, source && source.isValid ? source : undefined);
  }
}

const deathSent = new Set<string>();

function finish(r: Run): void {
  r.moon?.remove();
  r.rim?.remove();
  for (const p of r.pillars) p.remove();
  for (const o of r.others) o.remove();
  run = null;
  doneFor = r.dragon;
  save();
  log('ultimo aliento: fin, muerte vanilla');
  let brain = r.brain;
  if (!brain || !brain.dragon.isValid) {
    brain = null;
    try {
      const dragon = end().getEntities({ type: 'minecraft:ender_dragon' }).find((d) => d.id === r.dragon) ?? end().getEntities({ type: 'minecraft:ender_dragon' })[0];
      if (dragon) brain = brainOf(dragon);
    } catch {
      brain = null;
    }
  }
  if (brain && !deathSent.has(r.dragon)) brain.finishDeath();
  deathSent.add(r.dragon);
}
