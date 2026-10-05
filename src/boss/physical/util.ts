import { Entity, Player, system } from '@minecraft/server';
import { isBlocking, setVelocity } from '../../core/damage';
import { alive, COLORS, dust } from '../../core/world';
import { V } from '../../util/vec';
import type { Brain } from '../brain';

/** Sonidos de Java usados por los ataques físicos (equivalentes aproximados de Bedrock). */
export const SND = {
  /** SND_ENDER_DRAGON_GROWL */
  growl: 'mob.enderdragon.growl',
  /** f_11893_ (ENDER_DRAGON_FLAP) */
  flap: 'mob.enderdragon.flap',
  /** f_11865_ (chasquido de mordisco) */
  bite: 'mob.ravager.bite',
  /** f_12316_ (PLAYER_ATTACK_STRONG) */
  strong: 'game.player.attack.strong',
  /** f_12317_ (PLAYER_ATTACK_SWEEP): Bedrock no tiene barrido; golpe fuerte grave */
  sweep: 'game.player.attack.strong',
  /** f_12314_ (PLAYER_ATTACK_KNOCKBACK) */
  knockback: 'game.player.attack.strong',
  /** SND_GENERIC_EXPLODE */
  explode: 'random.explode',
} as const;

/** Velocidad del objetivo en bloques/tick (position() - xo/yo/zo de Java). */
export function targetVel(e: Entity): V {
  try {
    return V.of(e.getVelocity());
  } catch {
    return V.ZERO;
  }
}

/** isPassenger(). */
export function isPassenger(e: Entity): boolean {
  try {
    return e.getComponent('minecraft:riding')?.entityRidingOn !== undefined;
  } catch {
    return false;
  }
}

/** isBlocking(): en Bedrock, agachado con escudo y mirando hacia el dragón. */
export function blocking(brain: Brain, e: Entity): boolean {
  return e instanceof Player && isBlocking(e, brain.position());
}

/** target.distanceTo(dragon). */
export function distTo(brain: Brain, e: Entity): number {
  return brain.position().distanceTo(e.location);
}

/** Altura del objetivo sobre el suelo (target.getY() - groundY). */
export function aboveGround(brain: Brain, e: Entity): number {
  return e.location.y - brain.groundY(e.location.x, e.location.z);
}

/** Set<LivingEntity>.add(e): true si no estaba. */
export function mark(set: Set<string>, e: Entity): boolean {
  if (set.has(e.id)) return false;
  set.add(e.id);
  return true;
}

/** Partícula SWEEP_ATTACK (no existe en Bedrock): ráfaga de polvo blanco grande. */
export function sweepFx(at: V, n: number, sx: number, sy: number, sz: number): void {
  dust(at, COLORS.white, n * 3, new V(sx, sy, sz), 0.02, 3);
}

/** Partícula FLASH: destello blanco breve. */
export function flashFx(at: V): void {
  dust(at, COLORS.white, 3, V.ZERO, 0, 5);
}

/** Partícula CLOUD (f_123796_) con dispersión. */
export function cloudFx(at: V, n: number, sx: number, sy: number, sz: number, speed: number): void {
  dust(at, COLORS.white, n, new V(sx, sy, sz), speed, 2.2);
}

/**
 * setDeltaMovement tras soltar del asiento: se aplica ya y otra vez el tick siguiente, porque en Bedrock
 * la velocidad puede perderse si la entidad aún se está desmontando.
 */
export function throwVictim(victim: Entity, x: number, y: number, z: number): void {
  setVelocity(victim, x, y, z);
  system.runTimeout(() => {
    if (alive(victim)) setVelocity(victim, x, y, z);
  }, 1);
}
