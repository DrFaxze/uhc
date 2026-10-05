import { Entity, Player, system, type Vector3 } from '@minecraft/server';
import { THROWN } from '../../../core/damage';
import { alive, end, height, now, validPlayer } from '../../../core/world';
import { V } from '../../../util/vec';

/**
 * Empuje aditivo (Entity.push + hurtMarked de Java) que también suma a los jugadores: a ellos se les lee la
 * velocidad actual y se les aplica la suma con knockback (applyKnockback sustituye la velocidad).
 */
export function addVelocity(e: Entity, x: number, y: number, z: number): void {
  try {
    if (e instanceof Player) {
      const v = e.getVelocity();
      e.applyKnockback({ x: v.x + x, z: v.z + z }, v.y + y);
    } else {
      e.applyImpulse({ x, y, z });
    }
  } catch {
    /* algunas entidades no aceptan impulso */
  }
}

/** isPassenger() de Java. */
export function isPassenger(e: Entity): boolean {
  try {
    return e.getComponent('minecraft:riding')?.entityRidingOn !== undefined;
  } catch {
    return false;
  }
}

/** Distancia de `p` al segmento from→to (k acotado a [0, 1], como en los rayos de Java). */
export function segmentDistance(from: V, to: V, p: Vector3): number {
  const seg = to.sub(from);
  const len2 = seg.lengthSqr();
  const k = len2 < 1e-4 ? 0 : Math.max(0, Math.min(1, V.of(p).sub(from).dot(seg) / len2));
  return from.add(seg.scale(k)).distanceTo(p);
}

// ---------------------------------------------------------------------------------------------------------
// fallDistance = 0: en Bedrock no se puede poner a cero la distancia de caída, así que mientras dura (y un
// margen después) la entidad entra en THROWN, que anula el daño de caída.

const fallGuard = new Map<string, number>();

export function guardFall(e: Entity, ticks = 40): void {
  const id = e.id;
  if (THROWN.has(id) && !fallGuard.has(id)) return; // lo gestiona otro (lanzamiento del núcleo)
  const pending = fallGuard.has(id);
  fallGuard.set(id, now() + ticks);
  THROWN.add(id);
  if (!pending) scheduleRelease(id, ticks);
}

function scheduleRelease(id: string, ticks: number): void {
  system.runTimeout(() => {
    const until = fallGuard.get(id);
    if (until === undefined) return;
    const left = until - now();
    if (left > 0) {
      scheduleRelease(id, left);
      return;
    }
    fallGuard.delete(id);
    THROWN.delete(id);
  }, Math.max(1, ticks));
}

// ---------------------------------------------------------------------------------------------------------
// Choques de proyectiles simulados

/** Entidades vivas que un proyectil del dragón puede tocar cerca de `at` (canHitEntity de Java). */
export function hittableNear(at: Vector3, radius: number): Entity[] {
  let list: Entity[] = [];
  try {
    list = end().getEntities({
      location: at,
      maxDistance: radius,
      excludeFamilies: ['improvedragon_fx', 'inanimate'],
      excludeTypes: ['minecraft:ender_dragon', 'minecraft:item', 'minecraft:xp_orb', 'minecraft:ender_crystal'],
    });
  } catch {
    return [];
  }
  return list.filter((e) => {
    if (!alive(e)) return false;
    if (e instanceof Player) return validPlayer(e);
    try {
      return e.getComponent('minecraft:health') !== undefined;
    } catch {
      return false;
    }
  });
}

/**
 * Primera entidad que toca una caja de lado `size` que se mueve de `from` a `to` (getHitResultOnMoveVector).
 * Las cajas de las entidades se aproximan con 0,6 de ancho y su altura.
 */
export function firstEntityOnMove(from: V, to: V, size: number): Entity | null {
  const move = to.sub(from);
  const len = move.length();
  const half = size * 0.5;
  let best: Entity | null = null;
  let bestK = Infinity;
  for (const e of hittableNear(from.lerp(to, 0.5), len * 0.5 + 3)) {
    const p = V.of(e.location);
    const h = height(e);
    const w = 0.3;
    // Caja de la entidad engordada con la del proyectil: intersección rayo-caja (slabs).
    const min = new V(p.x - w - half, p.y - half, p.z - w - half);
    const max = new V(p.x + w + half, p.y + h + half, p.z + w + half);
    const k = rayBox(from, move, min, max);
    if (k !== null && k < bestK) {
      bestK = k;
      best = e;
    }
  }
  return best;
}

function rayBox(o: V, d: V, min: V, max: V): number | null {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, min.x, max.x],
    [o.y, d.y, min.y, max.y],
    [o.z, d.z, min.z, max.z],
  ];
  for (const [oo, dd, lo, hi] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return null;
      continue;
    }
    let a = (lo - oo) / dd;
    let b = (hi - oo) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
