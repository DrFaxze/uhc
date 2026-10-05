import {
  Entity,
  EntityDamageCause,
  EquipmentSlot,
  InputPermissionCategory,
  Player,
  system,
  world,
  type Vector3,
} from '@minecraft/server';
import { alive, mid, now, sound } from './world';
import { V } from '../util/vec';

/**
 * Tipos de daño del mod (data/improvedragon/damage_type y sus tags de Java).
 *  - true: se salta armadura, efectos, encantamientos y resistencia ("daño verdadero").
 *  - blockable: el escudo lo para (si mira hacia el dragón).
 *  - disables: si se bloquea, desactiva el escudo 5 s.
 */
export interface DamageType {
  id: string;
  true: boolean;
  blockable: boolean;
  disables: boolean;
}

const T = (id: string, opts: Partial<Omit<DamageType, 'id'>> = {}): DamageType => ({
  id,
  true: opts.true ?? false,
  blockable: opts.blockable ?? true,
  disables: opts.disables ?? false,
});

export const DT = {
  BITE: T('bite'),
  BLACK_HOLE: T('black_hole', { true: true, blockable: false }),
  BLACK_VEIL: T('black_veil', { blockable: false }),
  BLOOD_MOON: T('blood_moon'),
  BLOODTHIRST: T('bloodthirst', { disables: true }),
  BLOODTHIRST_BITE: T('bloodthirst_bite', { true: true, disables: true }),
  DEATH_EXPLOSION: T('death_explosion', { true: true, blockable: false }),
  DEATH_RAY: T('death_ray'),
  ECLIPSE_HUNT: T('eclipse_hunt', { blockable: false }),
  ELECTRIC: T('electric'),
  FAULT: T('fault', { blockable: false }),
  FRACTURE: T('fracture'),
  FROST: T('frost'),
  GRAB_BITE: T('grab_bite', { true: true, blockable: false }),
  GRAB_SLAM: T('grab_slam', { true: true, blockable: false }),
  JUDGMENT: T('judgment', { blockable: false }),
  RAGE_EXPLOSION: T('rage_explosion', { disables: true }),
  RAPTURE_BITE: T('rapture_bite', { blockable: false }),
  REQUIEM: T('requiem', { disables: true }),
  REQUIEM_RESONANCE: T('requiem_resonance', { true: true, blockable: false }),
  RIFT_COLLAPSE: T('rift_collapse'),
  RITE: T('rite'),
  ROAR: T('roar'),
  RUIN_PULSE: T('ruin_pulse'),
  SHOCKWAVE: T('shockwave'),
  SLAM: T('slam'),
  SONIC_RAY: T('sonic_ray', { disables: true }),
  TAIL_SWEEP: T('tail_sweep'),
  TAIL_WHIP: T('tail_whip', { blockable: false }),
  VEIL_FIRE: T('veil_fire', { blockable: false }),
  WING_FLAP: T('wing_flap', { blockable: false }),
} as const;

/**
 * Rebalanceo de Bedrock (pedido para este port):
 *  - daño normal: hasta 80 se queda a la mitad; por encima se comprime de forma continua a 40..160
 *    (1000, el golpe más alto del mod, queda en 160);
 *  - daño verdadero: a la mitad.
 */
export function rebalance(damage: number, trueDamage: boolean): number {
  if (damage <= 0) return 0;
  if (trueDamage) return damage / 2;
  if (damage <= 80) return damage / 2;
  return 40 + ((damage - 80) * 120) / 920;
}

// ---------------------------------------------------------------------------------------------------------
// Escudo

const shieldDisabledUntil = new Map<string, number>();

function holdsShield(p: Player): boolean {
  try {
    const eq = p.getComponent('minecraft:equippable');
    const off = eq?.getEquipment(EquipmentSlot.Offhand);
    const main = eq?.getEquipment(EquipmentSlot.Mainhand);
    return off?.typeId === 'minecraft:shield' || main?.typeId === 'minecraft:shield';
  } catch {
    return false;
  }
}

/** En Bedrock el escudo se levanta agachándose; bloquea si además mira hacia el atacante. */
export function isBlocking(p: Player, from: Vector3): boolean {
  if (!p.isSneaking || !holdsShield(p)) return false;
  if ((shieldDisabledUntil.get(p.id) ?? 0) > now()) return false;
  const look = V.of(p.getViewDirection()).flat().normalize();
  const to = V.of(from).sub(p.location).flat().normalize();
  return look.dot(to) > 0;
}

export function disableShield(p: Player, ticks = 100): void {
  shieldDisabledUntil.set(p.id, now() + ticks);
  try {
    p.startItemCooldown('shield', ticks);
  } catch {
    /* sin categoría */
  }
  sound(p.location, 'random.break', 1, 0.8);
}

function wearShield(p: Player, amount: number): void {
  if (amount < 3) return;
  try {
    const eq = p.getComponent('minecraft:equippable');
    if (!eq) return;
    for (const slot of [EquipmentSlot.Offhand, EquipmentSlot.Mainhand]) {
      const item = eq.getEquipment(slot);
      if (item?.typeId !== 'minecraft:shield') continue;
      const dur = item.getComponent('minecraft:durability');
      if (dur) {
        const next = dur.damage + 1 + Math.floor(amount);
        if (next >= dur.maxDurability) {
          eq.setEquipment(slot, undefined);
          sound(p.location, 'random.break', 1, 1);
        } else {
          dur.damage = next;
          eq.setEquipment(slot, item);
        }
      }
      return;
    }
  } catch {
    /* sin equipo */
  }
}

// ---------------------------------------------------------------------------------------------------------
// Golpes

/** Entidades lanzadas por el aire: no reciben daño de caída hasta el estampado. */
export const THROWN = new Set<string>();

/**
 * Golpe firmado por `source` (normalmente el dragón). Aplica el rebalanceo, el escudo y el empuje.
 * Devuelve true si el golpe entró (equivale a hurt() de Java).
 */
export function strike(
  victim: Entity,
  type: DamageType,
  damage: number,
  source: Entity | undefined,
  dir: Vector3 = V.ZERO,
  pushH = 0,
  pushV = 0,
  blockFrom?: Vector3,
): boolean {
  if (!alive(victim)) return false;
  const amount = rebalance(damage, type.true);
  if (victim instanceof Player && type.blockable) {
    const from = blockFrom ?? (source && source.isValid ? source.location : undefined);
    if (from && isBlocking(victim, from)) {
      wearShield(victim, amount);
      sound(victim.location, 'item.shield.block', 1, 0.8 + Math.random() * 0.4);
      if (type.disables) disableShield(victim);
      return false;
    }
  }
  let hit = false;
  if (amount > 0) hit = type.true ? trueDamage(victim, amount, source) : normalDamage(victim, amount, source);
  else hit = true;
  if (hit && (pushH !== 0 || pushV !== 0)) {
    let d = V.of(dir).flat();
    d = d.lengthSqr() < 1e-4 ? new V(Math.random() - 0.5, 0, Math.random() - 0.5).normalize() : d.normalize();
    push(victim, d.x * pushH, pushV, d.z * pushH);
  }
  return hit;
}

function normalDamage(victim: Entity, amount: number, source: Entity | undefined): boolean {
  try {
    return victim.applyDamage(amount, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: source && source.isValid ? source : undefined,
    });
  } catch {
    return false;
  }
}

/** Daño que se salta armadura y efectos: se resta de la vida; si es letal, golpe "override" (el tótem salva). */
export function trueDamage(victim: Entity, amount: number, source: Entity | undefined): boolean {
  try {
    const h = victim.getComponent('minecraft:health');
    if (!h) return false;
    if (h.currentValue - amount > 0.01) {
      h.setCurrentValue(h.currentValue - amount);
      const at = mid(victim);
      sound(at, victim.typeId === 'minecraft:player' ? 'game.player.hurt' : 'random.hurt', 1, 1);
      try {
        victim.dimension.spawnParticle('minecraft:critical_hit_emitter', at);
      } catch {
        /* fuera de carga */
      }
      return true;
    }
    return victim.applyDamage(h.currentValue + 1000, {
      cause: EntityDamageCause.override,
      damagingEntity: source && source.isValid ? source : undefined,
    });
  } catch {
    return false;
  }
}

/** Empuje (Entity.push de Java): suma velocidad. A los jugadores se les aplica con knockback. */
export function push(victim: Entity, x: number, y: number, z: number): void {
  try {
    if (victim.typeId === 'minecraft:player') {
      // applyKnockback fija la velocidad: se suma a la actual para que sea un empuje como en Java.
      const v = victim.getVelocity();
      victim.applyKnockback({ x: v.x + x, z: v.z + z }, (victim.isOnGround ? 0 : v.y) + y);
    } else {
      victim.applyImpulse({ x, y, z });
    }
  } catch {
    /* algunas entidades no aceptan impulso */
  }
}

/** Fija la velocidad (setDeltaMovement): quita la actual y aplica la nueva. */
export function setVelocity(victim: Entity, x: number, y: number, z: number): void {
  try {
    if (victim.typeId === 'minecraft:player') {
      victim.applyKnockback({ x, z }, y);
    } else {
      victim.clearVelocity();
      victim.applyImpulse({ x, y, z });
    }
  } catch {
    /* ignorar */
  }
}

/** Registra la anulación de caída de los lanzados. */
export function registerDamageEvents(): void {
  world.beforeEvents.entityHurt.subscribe((ev) => {
    if (ev.damageSource.cause === EntityDamageCause.fall && THROWN.has(ev.hurtEntity.id)) ev.cancel = true;
  });
  world.afterEvents.playerSpawn.subscribe(({ player }) => {
    THROWN.delete(player.id);
    system.run(() => {
      try {
        if (player.isValid) {
          player.inputPermissions.setPermissionCategory(InputPermissionCategory.Dismount, true);
        }
      } catch {
        /* ignorar */
      }
    });
  });
}
