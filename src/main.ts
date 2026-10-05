import { Entity, EntityDamageCause, system, world } from '@minecraft/server';
import { C } from './config';
import { brainOf, brains, forgetBrain } from './boss/brain';
import { registerDamageEvents, rebalance } from './core/damage';
import { end } from './core/world';
import { registerEffectEvents, tickEffects } from './fx/effect';
import { restoreDismount, tickSeats } from './fx/seat';
import { registerCommands } from './commands';
import { registerLastBreath, tickLastBreath } from './world/lastBreath';
import { registerRiftMobEvents } from './boss/ability/wrath/riftMobs';

const DRAGON = 'minecraft:ender_dragon';
const tracked = new Map<string, Entity>();

function track(e: Entity): void {
  try {
    if (e.typeId === DRAGON && e.dimension.id === 'minecraft:the_end') tracked.set(e.id, e);
  } catch {
    /* ignorar */
  }
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  track(entity);
  // La IA vanilla de la fase 1 dispara una bola: el cerebro la convierte en ráfaga.
  try {
    if (entity.typeId === 'minecraft:dragon_fireball') {
      const owner = entity.getComponent('minecraft:projectile')?.owner;
      if (owner?.typeId === DRAGON) brainOf(owner).onVanillaFireball();
    }
  } catch {
    /* ignorar */
  }
});
world.afterEvents.entityLoad.subscribe(({ entity }) => track(entity));
world.beforeEvents.entityRemove.subscribe(({ removedEntity }) => {
  if (removedEntity.typeId !== DRAGON) return;
  const id = removedEntity.id;
  tracked.delete(id);
  system.run(() => {
    for (const b of brains()) {
      if (b.dragon.id === id) {
        b.unload();
        forgetBrain(id);
        break;
      }
    }
  });
});
world.afterEvents.playerSpawn.subscribe(({ player }) => restoreDismount(player));

// ------------------------------------------------------------------------------------------------------------
// Daño recibido por el dragón (DragonEvents.onAttack / onHurt)

world.beforeEvents.entityHurt.subscribe((ev) => {
  const e = ev.hurtEntity;
  if (e.typeId !== DRAGON) {
    // Bolas de los ghasts de las grietas: hasta riftGhastMaxDamage (y el rebalanceo de Bedrock).
    const proj = ev.damageSource.damagingProjectile;
    if (proj && proj.typeId === 'minecraft:fireball') {
      try {
        const owner = proj.getComponent('minecraft:projectile')?.owner;
        if (owner?.hasTag('improvedragon_rift')) {
          const explosion = ev.damageSource.cause === EntityDamageCause.entityExplosion || ev.damageSource.cause === EntityDamageCause.blockExplosion;
          const vanillaMax = explosion ? 15 : 6;
          const max = C.RIFT_GHAST_MAX_DAMAGE;
          ev.damage = rebalance(Math.min(max, (ev.damage * max) / vanillaMax), false);
        }
      } catch {
        /* ignorar */
      }
    }
    return;
  }
  const brain = brainOf(e);
  if (brain.allowDeath) return;
  const src = ev.damageSource;
  const cause = src.cause;
  if (cause === EntityDamageCause.override && !src.damagingEntity) return;
  const explosion = cause === EntityDamageCause.blockExplosion || cause === EntityDamageCause.entityExplosion;
  if (C.EXPLOSION_IMMUNE && explosion) {
    ev.cancel = true;
    return;
  }
  const projectile = cause === EntityDamageCause.projectile || src.damagingProjectile !== undefined;
  if (brain.immune() || (brain.projectileImmune() && projectile)) {
    ev.cancel = true;
    return;
  }
  const phase = brain.activePhase();
  const arrow = src.damagingProjectile?.typeId === 'minecraft:arrow';
  const melee = cause === EntityDamageCause.entityAttack && !projectile;
  let mod = 0;
  if (arrow) mod = phase <= 1 ? C.P1_ARROW : phase <= 3 ? C.DRACONIC_ARROW : C.WRATH_ARROW;
  else if (melee) mod = phase <= 1 ? C.P1_MELEE : phase <= 3 ? C.DRACONIC_MELEE : C.WRATH_MELEE;
  const amount = ev.damage * Math.max(0, 1 + mod) * brain.damageTakenFactor();
  ev.damage = amount;
  // Golpe letal: la muerte espera al Último Aliento.
  let health = 0;
  try {
    health = e.getComponent('minecraft:health')?.currentValue ?? 0;
  } catch {
    health = 0;
  }
  if (amount >= health) {
    ev.cancel = true;
    system.run(() => brain.beginDeath());
  }
});

// ------------------------------------------------------------------------------------------------------------
// Bucle principal

registerEffectEvents();
registerDamageEvents();
registerRiftMobEvents();
registerLastBreath();
registerCommands();

system.runInterval(() => {
  for (const [id, e] of tracked) {
    let valid = false;
    try {
      valid = e.isValid;
    } catch {
      valid = false;
    }
    if (!valid) {
      tracked.delete(id);
      continue;
    }
    try {
      brainOf(e).tick();
    } catch (err) {
      console.warn(`[improvedragon] error en el cerebro: ${err}\n${(err as Error)?.stack ?? ''}`);
    }
  }
  try {
    tickEffects();
    tickSeats();
    tickLastBreath();
  } catch (err) {
    console.warn(`[improvedragon] error en efectos: ${err}`);
  }
}, 1);

// Dragones ya cargados al arrancar los scripts.
system.runTimeout(() => {
  try {
    for (const e of end().getEntities({ type: DRAGON })) track(e);
  } catch {
    /* el End no está cargado */
  }
}, 2);
