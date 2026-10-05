import { EnchantmentType, Entity, EquipmentSlot, ItemStack, system, world, type Vector3 } from '@minecraft/server';
import { C } from '../../../config';
import { end } from '../../../core/world';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';

/** RiftMobs de Java: los mobs de las Grietas dimensionales y su botín (parte de DragonEvents). */
export const RIFT_TAG = 'improvedragon_rift';
export const SUMMON_TAG = 'improvedragon_summon';

const FOREVER = 20000000;
const POSITIVE = ['speed', 'strength', 'resistance', 'regeneration', 'fire_resistance', 'jump_boost', 'absorption', 'invisibility', 'health_boost'];
const ARMOR: [EquipmentSlot, string][] = [
  [EquipmentSlot.Head, 'helmet'],
  [EquipmentSlot.Chest, 'chestplate'],
  [EquipmentSlot.Legs, 'leggings'],
  [EquipmentSlot.Feet, 'boots'],
];
const NETHER = new Set(['minecraft:piglin', 'minecraft:hoglin', 'minecraft:zoglin', 'minecraft:magma_cube', 'minecraft:blaze', 'minecraft:ghast', 'minecraft:wither_skeleton']);
const NO_ZOMBIFY = new Set(['minecraft:piglin', 'minecraft:hoglin']);
const SPLITTERS = new Set(['minecraft:slime', 'minecraft:magma_cube']);

export const RIFT_ENDERMAN = 'improvedragon:rift_enderman';
export const GHAST = 'minecraft:ghast';

/** RiftMobs.pool: mobs de cada variante de grieta. */
export function riftPool(variant: string): string[] {
  switch (variant) {
    case 'cave':
      return ['minecraft:cave_spider', 'minecraft:spider', 'minecraft:slime', 'minecraft:skeleton', 'minecraft:zombie'];
    case 'plains':
      return ['minecraft:creeper', 'minecraft:spider', 'minecraft:witch'];
    case 'ocean':
      return ['minecraft:drowned', 'minecraft:guardian', 'minecraft:elder_guardian'];
    case 'night_forest':
      return ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper'];
    case 'crimson_forest':
      return ['minecraft:hoglin', 'minecraft:zoglin', 'minecraft:piglin'];
    case 'basalt_delta':
      return ['minecraft:magma_cube', 'minecraft:blaze', GHAST];
    case 'soulsand_valley':
      return ['minecraft:skeleton', 'minecraft:wither_skeleton', GHAST];
    default:
      return [RIFT_ENDERMAN];
  }
}

/** RiftMobs.spawn. */
export function spawnRiftMob(type: string, pos: Vector3, variant: string): void {
  const overworldLand = variant === 'cave' || variant === 'plains' || variant === 'night_forest';
  let mini = false;
  if (overworldLand && rand.nextDouble() < C.RIFT_MINI_CHANCE) {
    type = 'minecraft:zombie';
    mini = true;
  } else if (variant === 'ocean' && rand.nextDouble() < C.RIFT_MINI_CHANCE) {
    type = 'minecraft:drowned';
    mini = true;
  }
  const mob = create(type, pos, mini ? 'minecraft:as_baby' : undefined);
  if (!mob) return;
  equip(mob, type, mini);
  if (mini && type === 'minecraft:zombie') {
    // Mini zombi montado en un pollo (chicken jockey).
    const chicken = create('minecraft:chicken', pos, 'minecraft:spawn_adult');
    if (chicken) {
      try {
        chicken.getComponent('minecraft:rideable')?.addRider(mob);
      } catch {
        /* ignorar */
      }
    }
    return;
  }
  if (!mini && type === 'minecraft:drowned' && rand.nextDouble() < C.RIFT_GUARDIAN_RIDER_CHANCE) {
    const guardian = create(rand.nextBoolean() ? 'minecraft:guardian' : 'minecraft:elder_guardian', pos);
    if (guardian) {
      randomEffects(guardian, C.RIFT_RANDOM_EFFECTS_MAX, 2, true);
      fillHealth(guardian);
      ride(guardian, mob);
    }
  }
}

export function isRiftMob(e: Entity): boolean {
  try {
    return e.hasTag(RIFT_TAG);
  } catch {
    return false;
  }
}

function noLoot(e: Entity): boolean {
  try {
    return e.hasTag(RIFT_TAG) || e.hasTag(SUMMON_TAG);
  } catch {
    return false;
  }
}

function create(type: string, pos: Vector3, spawnEvent?: string): Entity | null {
  try {
    const mob = end().spawnEntity(type, pos, { initialPersistence: true, initialRotation: rand.nextFloat() * 360, spawnEvent });
    mob.addTag(RIFT_TAG);
    return mob;
  } catch {
    // Dificultad pacífica o tipo no invocable.
    return null;
  }
}

function equip(mob: Entity, type: string, mini: boolean): void {
  const zombieLike = type === 'minecraft:zombie' || type === 'minecraft:drowned';
  if (mini && zombieLike) {
    setArmor(mob, true, 4, 4, false);
    setItem(mob, EquipmentSlot.Mainhand, sword('minecraft:netherite_sword'));
    strength(mob, 2);
  } else if (type === 'minecraft:zombie') {
    setArmor(mob, false, 1, 3, false);
    setItem(mob, EquipmentSlot.Mainhand, sword('minecraft:iron_sword'));
    strength(mob, 3);
  } else if (type === 'minecraft:skeleton') {
    setArmor(mob, false, 1, 3, true);
    setItem(mob, EquipmentSlot.Mainhand, enchantedBow());
  }
  if (type === 'minecraft:spider' || type === 'minecraft:cave_spider') randomEffects(mob, C.RIFT_SPIDER_EFFECTS, 5, false);
  else randomEffects(mob, C.RIFT_RANDOM_EFFECTS_MAX, 2, true);
  if (NETHER.has(type)) strength(mob, 3 + rand.nextInt(3));
  if (NO_ZOMBIFY.has(type)) stopZombification(mob);
  else if (type === RIFT_ENDERMAN) strength(mob, 5);
  fillHealth(mob);
}

/** mob.setHealth(mob.getMaxHealth()) después de que Vida extra suba el máximo. */
function fillHealth(mob: Entity): void {
  system.runTimeout(() => {
    try {
      const h = mob.isValid ? mob.getComponent('minecraft:health') : undefined;
      if (h) h.setCurrentValue(h.effectiveMax);
    } catch {
      /* ignorar */
    }
  }, 2);
}

function enchant(stack: ItemStack, id: string, level: number): void {
  try {
    stack.getComponent('minecraft:enchantable')?.addEnchantment({ type: new EnchantmentType(id), level });
  } catch {
    /* encantamiento no aplicable */
  }
}

function setArmor(mob: Entity, netherite: boolean, min: number, max: number, thorns: boolean): void {
  for (const [slot, piece] of ARMOR) {
    const material = netherite ? 'netherite' : rand.nextBoolean() ? 'diamond' : 'iron';
    const stack = new ItemStack(`minecraft:${material}_${piece}`);
    enchant(stack, thorns ? 'thorns' : 'protection', min + rand.nextInt(max - min + 1));
    setItem(mob, slot, stack);
  }
}

function sword(id: string): ItemStack {
  const stack = new ItemStack(id);
  enchant(stack, 'sharpness', 5);
  return stack;
}

/** EnchantmentHelper.enchantItem(bow, 30): reparto aproximado de una mesa a nivel 30. */
function enchantedBow(): ItemStack {
  const stack = new ItemStack('minecraft:bow');
  enchant(stack, 'power', rand.roll(3, 5));
  if (rand.nextDouble() < 0.5) enchant(stack, 'unbreaking', rand.roll(1, 3));
  if (rand.nextDouble() < 0.35) enchant(stack, 'punch', rand.roll(1, 2));
  if (rand.nextDouble() < 0.3) enchant(stack, 'flame', 1);
  return stack;
}

function setItem(mob: Entity, slot: EquipmentSlot, stack: ItemStack): void {
  try {
    const eq = mob.getComponent('minecraft:equippable');
    if (eq && eq.setEquipment(slot, stack)) return;
  } catch {
    /* sin componente: se intenta con el comando */
  }
  // Respaldo: replaceitem (sin encantamientos).
  const where: Record<string, string> = {
    [EquipmentSlot.Head]: 'slot.armor.head',
    [EquipmentSlot.Chest]: 'slot.armor.chest',
    [EquipmentSlot.Legs]: 'slot.armor.legs',
    [EquipmentSlot.Feet]: 'slot.armor.feet',
    [EquipmentSlot.Mainhand]: 'slot.weapon.mainhand',
  };
  const target = where[slot];
  if (!target) return;
  try {
    mob.runCommand(`replaceitem entity @s ${target} 0 ${stack.typeId}`);
  } catch {
    /* ignorar */
  }
}

function strength(mob: Entity, level: number): void {
  try {
    mob.addEffect('strength', FOREVER, { amplifier: level - 1 });
  } catch {
    /* inmune a efectos */
  }
}

function randomEffects(mob: Entity, count: number, maxLevel: number, upTo: boolean): void {
  const n = upTo ? rand.nextInt(count + 1) : count;
  const left = [...POSITIVE];
  for (let k = 0; k < n && left.length > 0; k++) {
    const effect = left.splice(rand.nextInt(left.length), 1)[0];
    try {
      mob.addEffect(effect, FOREVER, { amplifier: rand.nextInt(maxLevel) });
    } catch {
      /* ignorar */
    }
  }
}

// ------------------------------------------------------------------------------------------------------------
// Guardián montado en un ahogado: el ahogado de Bedrock no tiene minecraft:rideable, así que el guardián va
// "montado" a mano (se teletransporta cada tick encima de la cabeza del ahogado).

interface Ride {
  rider: Entity;
  mount: Entity;
}
const RIDES: Ride[] = [];

function ride(rider: Entity, mount: Entity): void {
  try {
    if (mount.getComponent('minecraft:rideable')?.addRider(rider)) return;
  } catch {
    /* sin asiento */
  }
  RIDES.push({ rider, mount });
}

function tickRides(): void {
  for (let i = 0; i < RIDES.length; i++) {
    const r = RIDES[i];
    let ok = false;
    try {
      ok = r.rider.isValid && r.mount.isValid && (r.mount.getComponent('minecraft:health')?.currentValue ?? 1) > 0;
      if (ok) {
        const at = r.mount.location;
        r.rider.teleport({ x: at.x, y: at.y + 1.95, z: at.z });
      }
    } catch {
      ok = false;
    }
    if (!ok) RIDES.splice(i--, 1);
  }
}

// ------------------------------------------------------------------------------------------------------------
// Piglins y hoglins sin zombificar: su sensor (in_nether == false) lanza un temporizador de 15 s. No hay
// evento que quite el sensor, así que se reinicia el temporizador cada 5 s con stop_zombification_event.

function stopZombification(mob: Entity): void {
  try {
    mob.triggerEvent('stop_zombification_event');
  } catch {
    /* ignorar */
  }
}

function tickZombification(): void {
  for (const id of ['minecraft:the_end', 'minecraft:overworld']) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [RIFT_TAG] })) {
        if (NO_ZOMBIFY.has(e.typeId)) stopZombification(e);
      }
    } catch {
      /* dimensión sin cargar */
    }
  }
}

// ------------------------------------------------------------------------------------------------------------
// Sin botín ni experiencia (DragonEvents.onDrops / onExperience) y herencia del tag (DragonEvents.onJoin).

/** Muerte reciente de un mob sin botín. */
interface Death {
  entity: Entity;
  at: V;
  dim: string;
  type: string;
  gone: number;
  until: number;
}
const DEATHS: Death[] = [];
/** Objetos y orbes recién aparecidos (por si el evento de muerte llega después). */
const RECENT: { e: Entity; t: number }[] = [];
/** Jugadores muertos: sus objetos no se tocan. */
const PROTECT: { at: V; dim: string; until: number }[] = [];

const LOOT_RADIUS = 3;
/** En Bedrock el botín puede caer al acabar la animación de muerte (~20 ticks): se vigila hasta 2 ticks después. */
const MAX_WINDOW = 40;
const AFTER_GONE = 2;

function isLoot(e: Entity): boolean {
  return e.typeId === 'minecraft:item' || e.typeId === 'minecraft:xp_orb';
}

function deathCenter(d: Death): V {
  try {
    if (d.entity.isValid) d.at = V.of(d.entity.location);
  } catch {
    /* ya no existe */
  }
  return d.at;
}

function protectedAt(p: V, dim: string): boolean {
  return PROTECT.some((z) => z.dim === dim && z.at.distanceToSqr(p) <= (LOOT_RADIUS + 1) ** 2);
}

function nearDeath(e: Entity, filter?: (d: Death) => boolean): boolean {
  let p: V;
  let dim: string;
  try {
    p = V.of(e.location);
    dim = e.dimension.id;
  } catch {
    return false;
  }
  const t = system.currentTick;
  for (const d of DEATHS) {
    if (d.dim !== dim || t > d.until) continue;
    if (filter && !filter(d)) continue;
    if (deathCenter(d).distanceToSqr(p) <= LOOT_RADIUS * LOOT_RADIUS) return true;
  }
  return false;
}

function removeLoot(e: Entity): void {
  try {
    if (protectedAt(V.of(e.location), e.dimension.id)) return;
    e.remove();
  } catch {
    system.run(() => {
      try {
        if (e.isValid) e.remove();
      } catch {
        /* ignorar */
      }
    });
  }
}

function tickDeaths(): void {
  const t = system.currentTick;
  for (let i = 0; i < DEATHS.length; i++) {
    const d = DEATHS[i];
    let valid = false;
    try {
      valid = d.entity.isValid;
    } catch {
      valid = false;
    }
    if (!valid && d.gone < 0) {
      d.gone = t;
      d.until = Math.min(d.until, t + AFTER_GONE);
    }
    if (t > d.until) DEATHS.splice(i--, 1);
  }
  while (RECENT.length > 0 && t - RECENT[0].t > 2) RECENT.shift();
  for (let i = 0; i < PROTECT.length; i++) if (t > PROTECT[i].until) PROTECT.splice(i--, 1);
}

export function registerRiftMobEvents(): void {
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    let at: V;
    let dim: string;
    try {
      at = V.of(deadEntity.location);
      dim = deadEntity.dimension.id;
    } catch {
      return;
    }
    const t = system.currentTick;
    if (deadEntity.typeId === 'minecraft:player') {
      PROTECT.push({ at, dim, until: t + 5 });
      return;
    }
    if (!noLoot(deadEntity)) return;
    const d: Death = { entity: deadEntity, at, dim, type: deadEntity.typeId, gone: -1, until: t + MAX_WINDOW };
    DEATHS.push(d);
    // Objetos que aparecieron en este mismo tick antes del evento de muerte.
    for (const r of RECENT) {
      try {
        if (r.e.isValid && r.e.dimension.id === dim && V.of(r.e.location).distanceToSqr(at) <= LOOT_RADIUS * LOOT_RADIUS) removeLoot(r.e);
      } catch {
        /* ignorar */
      }
    }
  });

  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try {
      if (isLoot(entity)) {
        if (DEATHS.length > 0 && nearDeath(entity)) removeLoot(entity);
        else RECENT.push({ e: entity, t: system.currentTick });
        return;
      }
      // Slimes y cubos de magma hijos de uno de grieta heredan el tag.
      if (SPLITTERS.has(entity.typeId) && !entity.hasTag(RIFT_TAG) && DEATHS.length > 0) {
        if (nearDeath(entity, (d) => SPLITTERS.has(d.type))) entity.addTag(RIFT_TAG);
      }
    } catch {
      /* ignorar */
    }
  });

  system.runInterval(() => {
    if (DEATHS.length > 0 || RECENT.length > 0 || PROTECT.length > 0) tickDeaths();
    if (RIDES.length > 0) tickRides();
  }, 1);
  system.runInterval(tickZombification, 100);
}
