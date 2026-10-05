import {
  Dimension,
  Entity,
  GameMode,
  MolangVariableMap,
  Player,
  system,
  world,
  type Vector3,
} from '@minecraft/server';
import { V, v } from '../util/vec';

export const NS = 'improvedragon';
export const TARGET_TAG = 'improvedragon_target';
/** Identificador de la sesión de scripts: los efectos de una sesión anterior se borran al cargarse. */
export const SESSION = Math.floor(Math.random() * 1e9);

export function now(): number {
  return system.currentTick;
}

export function end(): Dimension {
  return world.getDimension('minecraft:the_end');
}

export function alive(e: Entity | undefined | null): e is Entity {
  if (!e) return false;
  try {
    if (!e.isValid) return false;
    const h = e.getComponent('minecraft:health');
    return !h || h.currentValue > 0;
  } catch {
    return false;
  }
}

export function pos(e: Entity): V {
  return V.of(e.location);
}

/** Centro del cuerpo (DragonBrain.mid). */
export function mid(e: Entity): V {
  const h = height(e);
  return V.of(e.location).add(0, h * 0.5, 0);
}

export function height(e: Entity): number {
  if (e.typeId === 'minecraft:player') return 1.8;
  try {
    const box = e.getComponent('minecraft:collision_box') as unknown as { height?: number } | undefined;
    if (box && typeof box.height === 'number') return box.height;
  } catch {
    /* sin componente */
  }
  return 1.0;
}

export function validPlayer(p: Player): boolean {
  try {
    if (!p.isValid) return false;
    const mode = p.getGameMode();
    if (mode === GameMode.Creative || mode === GameMode.Spectator) return false;
    const h = p.getComponent('minecraft:health');
    return !h || h.currentValue > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sonido

export function sound(at: Vector3, id: string, volume = 1, pitch = 1, dim: Dimension = end()): void {
  try {
    dim.playSound(id, at, { volume: Math.min(volume, 16), pitch });
  } catch {
    /* fuera de carga */
  }
}

// ---------------------------------------------------------------------------------------------------------
// Partículas

export type RGB = readonly [number, number, number];
export const COLORS = {
  red: [1.0, 0.12, 0.1] as RGB,
  purple: [0.65, 0.2, 1.0] as RGB,
  pink: [1.0, 0.5, 0.85] as RGB,
  white: [1.0, 1.0, 1.0] as RGB,
  blue: [0.5, 0.8, 1.0] as RGB,
  black: [0.05, 0.02, 0.08] as RGB,
  crimson: [0.7, 0.02, 0.05] as RGB,
  ice: [0.7, 0.9, 1.0] as RGB,
  gold: [1.0, 0.8, 0.3] as RGB,
} as const;

function spawn(id: string, at: Vector3, vars?: MolangVariableMap, dim: Dimension = end()): void {
  try {
    if (vars) dim.spawnParticle(id, at, vars);
    else dim.spawnParticle(id, at);
  } catch {
    /* fuera de carga */
  }
}

/** Polvo de color (DustParticleOptions + sendFar con dispersión). Una sola llamada emite `count` partículas. */
export function dust(at: Vector3, color: RGB, count = 1, spread: Vector3 = V.ZERO, speed = 0, size = 1.6): void {
  const m = new MolangVariableMap();
  m.setColorRGBA('variable.color', { red: color[0], green: color[1], blue: color[2], alpha: 1 });
  m.setFloat('variable.count', Math.max(1, Math.min(200, Math.round(count))));
  m.setVector3('variable.spread', { x: spread.x, y: spread.y, z: spread.z });
  m.setFloat('variable.speed', speed);
  m.setFloat('variable.size', size);
  spawn(`${NS}:dust`, at, m);
}

/** Chispa de carga que viaja con velocidad `dir` (bloques/tick) durante 2 s. */
export function spark(at: Vector3, dir: Vector3, color: RGB): void {
  const m = new MolangVariableMap();
  m.setColorRGBA('variable.color', { red: color[0], green: color[1], blue: color[2], alpha: 1 });
  m.setVector3('variable.dir', { x: dir.x, y: dir.y, z: dir.z });
  spawn(`${NS}:spark`, at, m);
}

/** Onda plana de anillo que crece hasta `radius` en `ticks` (RingWaveParticle). */
export function ringWave(at: Vector3, radius: number, ticks: number, color: RGB): void {
  const m = new MolangVariableMap();
  m.setColorRGB('variable.color', { red: color[0], green: color[1], blue: color[2] });
  m.setFloat('variable.radius', radius);
  m.setFloat('variable.life', ticks / 20);
  spawn(`${NS}:ring_wave`, V.of(at).add(0, 0.3, 0), m);
}

/** Partícula vanilla de Bedrock por identificador. */
export function particle(id: string, at: Vector3, count = 1, spread = 0): void {
  for (let i = 0; i < count; i++) {
    const p = spread > 0 ? V.of(at).add((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread) : at;
    spawn(id, p);
  }
}

/** Equivalencias de las partículas vanilla de Java que usa el mod. */
export const PART = {
  explosionEmitter: 'minecraft:huge_explosion_emitter',
  explosion: 'minecraft:large_explosion',
  endRod: 'minecraft:endrod',
  cloud: 'minecraft:white_smoke_particle',
  smoke: 'minecraft:basic_smoke_particle',
  portal: 'minecraft:portal_reverse_particle',
  reversePortal: 'minecraft:portal_directional',
  sonicBoom: 'minecraft:sonic_explosion',
  dragonBreath: 'minecraft:dragon_breath_trail',
  soul: 'minecraft:soul_particle',
  soulFire: 'minecraft:blue_flame_particle',
  flame: 'minecraft:basic_flame_particle',
  snowflake: 'minecraft:snowflake_particle',
  electric: 'minecraft:electric_spark_particle',
  crit: 'minecraft:critical_hit_emitter',
  witch: 'minecraft:witchspell_emitter',
  lava: 'minecraft:lava_particle',
  totem: 'minecraft:totem_particle',
  ice: 'minecraft:snowflake_particle',
  sculk: 'minecraft:sculk_soul_particle',
  heart: 'minecraft:heart_particle',
  damage: 'minecraft:critical_hit_emitter',
} as const;

// ---------------------------------------------------------------------------------------------------------
// Terreno

const groundCache = new Map<number, { y: number | null; at: number }>();

/** Altura del suelo (primer bloque libre sobre el más alto) en x,z; null si no hay bloques o no está cargado. */
export function groundAt(x: number, z: number, dim: Dimension = end()): number | null {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const key = (bx + 4096) * 8192 + (bz + 4096);
  const t = now();
  const c = groundCache.get(key);
  if (c && t - c.at < 100) return c.y;
  let y: number | null = null;
  try {
    const top = dim.getTopmostBlock({ x: bx, z: bz });
    if (top && !top.isAir) y = top.location.y + 1;
  } catch {
    y = null;
  }
  if (groundCache.size > 20000) groundCache.clear();
  groundCache.set(key, { y, at: t });
  return y;
}

export function forgetGround(x: number, z: number): void {
  const key = (Math.floor(x) + 4096) * 8192 + (Math.floor(z) + 4096);
  groundCache.delete(key);
}

/** Primer bloque sólido en la línea from→to (null si está libre). */
export function blockHit(from: Vector3, to: Vector3, dim: Dimension = end()): V | null {
  const d = V.of(to).sub(from);
  const len = d.length();
  if (len < 0.01) return null;
  try {
    const hit = dim.getBlockFromRay(from, d.normalize(), { maxDistance: len, includeLiquidBlocks: false, includePassableBlocks: false });
    if (!hit) return null;
    return V.of(hit.block.location).add(hit.faceLocation);
  } catch {
    return null;
  }
}

export function isAirAt(p: Vector3, dim: Dimension = end()): boolean {
  try {
    const b = dim.getBlock(p);
    return !b || b.isAir;
  } catch {
    return false;
  }
}

export { v };
