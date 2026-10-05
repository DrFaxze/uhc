import { Entity, EntityDamageCause, Player, system, world, type Vector3 } from '@minecraft/server';
import { C } from '../config';
import { DT, push, strike, THROWN, type DamageType } from '../core/damage';
import {
  alive,
  COLORS,
  dust,
  end,
  groundAt,
  mid,
  particle,
  PART,
  ringWave,
  sound,
  spark,
  TARGET_TAG,
  validPlayer,
  type RGB,
} from '../core/world';
import { Effect, POSITION, setHeadResolver } from '../fx/effect';
import { Seat } from '../fx/seat';
import { rand } from '../util/rand';
import { clamp, DEG, forward, V, wrapDegrees, yawTo } from '../util/vec';
import { IcePrison } from '../world/icePrison';
import type { Ability, Task } from './api';
import { createAbility, DRACONIC_CENTER, DRACONIC_FLIGHT, parseWeights, pick, WRATH_CENTER, WRATH_FLIGHT } from './abilities';
import { findSpikes, Flight } from './flight';
import { PhysicalController } from './physical/controller';
import { FireballVolley, shootFireball } from './ability/fireballs';

export type State = 'NONE' | 'FLIGHT' | 'CENTER' | 'PHYSICAL' | 'SPECIAL' | 'TRANSITION';
type Kind = 'FLIGHT' | 'CENTER' | 'PHYSICAL' | 'SPECIAL';
interface Step {
  kind: Kind;
  ticks: number;
  count: number;
  pool: number;
  special: string | null;
  burst: boolean;
}
interface Thrown {
  victim: Entity;
  ticks: number;
  damage: number;
  waveDamage: number;
  waveRadius: number;
  trueWave: boolean;
}

/**
 * Movimiento libre cuando ninguna habilidad pide nada (equivale a las fases vanilla que usa el mod):
 * vanilla = IA de Bedrock (fase 1); hold = patrón de espera; strafe = pasada con ráfaga de bolas;
 * approach/landing = aproximación y aterrizaje en el podio; sit = posado; charge = carga de transición.
 */
type Move = 'vanilla' | 'hold' | 'strafe' | 'approach' | 'landing' | 'sit' | 'charge';

const BRAINS = new Map<string, Brain>();

export function brainOf(dragon: Entity): Brain {
  let b = BRAINS.get(dragon.id);
  if (!b) {
    b = new Brain(dragon);
    BRAINS.set(dragon.id, b);
  }
  return b;
}
export function brains(): Iterable<Brain> {
  return BRAINS.values();
}
export function forgetBrain(id: string): void {
  BRAINS.delete(id);
}

setHeadResolver((e) => {
  const b = BRAINS.get(e.id);
  return b ? b.head() : null;
});

/** El cerebro del dragón (DragonBrain de Java). */
export class Brain {
  readonly dragon: Entity;
  readonly flight: Flight;
  readonly physical: PhysicalController;
  private reachedPhaseV = 1;
  private activePhaseV = 1;
  private pendingTransitionV = 0;
  private f3Started = false;
  private f3Switch = false;
  private crystalHeal = 0;
  private stateV: State = 'NONE';
  private queue: Step[] = [];
  private step: Step | null = null;
  private elapsed = 0;
  private stepTicks = 0;
  private castAt: number[] = [];
  private castIndex = 0;
  private burstLeft = 0;
  private burstTimer = 0;
  private landed = false;
  private ability: Ability | null = null;
  private abilityIdV: string | null = null;
  private abilityIsSpecial = false;
  private lastFlight: string | null = null;
  private lastCenter: string | null = null;
  private tasks: Task[] = [];
  private owned: (Effect | Entity)[] = [];
  private prisons: IcePrison[] = [];
  private waves: ParticleWave[] = [];
  private thrown: Thrown[] = [];
  private boosts: { victim: Entity; ticks: number }[] = [];
  private roarTimer = -1;
  private pearlActive = 0;
  private pearlCooldown = 0;
  private pearlNext = 0;
  private immuneTicks = 0;
  private deathHandledV = false;
  private loaded = false;
  private saveTimer = 0;
  private flyTo: V | null = null;
  private flySpeed = 0;
  private flyAltitude = 0;
  private maneuver = false;
  private tickCount = 0;
  /** Movimiento libre. */
  private move: Move = 'vanilla';
  private holdTarget: V | null = null;
  private holdRetarget = 0;
  private holdClockwise = true;
  private strafeTarget: Entity | null = null;
  private strafeCharge = 0;
  private strafeBurst = 0;
  private chargeTicks = 0;
  private chargeTotal = 0;
  private chargeVariant = 0;
  private chargeRings: Effect | null = null;
  private centerCache: V | null = null;
  private centerAt = -1000;
  private scripted = false;
  private hidden = false;
  /** El dragón ya puede morir (fin del Último Aliento). */
  allowDeath = false;

  constructor(dragon: Entity) {
    this.dragon = dragon;
    const r = dragon.getRotation();
    this.flight = new Flight(V.of(dragon.location), r.y);
    this.physical = new PhysicalController(this);
  }

  // ------------------------------------------------------------------------------------------------------
  // Consultas

  reachedPhase(): number {
    return this.reachedPhaseV;
  }
  activePhase(): number {
    return this.activePhaseV;
  }
  pendingTransition(): number {
    return this.pendingTransitionV;
  }
  wrath(): boolean {
    return this.activePhaseV >= 4;
  }
  state(): State {
    return this.stateV;
  }
  deathHandled(): boolean {
    return this.deathHandledV;
  }
  specialRunning(): boolean {
    return this.ability !== null && this.abilityIsSpecial;
  }
  immune(): boolean {
    return this.pendingTransitionV !== 0 || this.immuneTicks > 0 || (this.ability?.immune?.() ?? false) || this.deathHandledV;
  }
  projectileImmune(): boolean {
    return this.wrath() && this.stateV === 'PHYSICAL';
  }
  damageTakenFactor(): number {
    let f = this.ability?.damageTaken?.() ?? 1;
    for (const t of this.tasks) f *= t.damageTaken?.() ?? 1;
    return f;
  }
  allowsStrafe(): boolean {
    return this.activePhaseV < 2 || (this.pendingTransitionV === 0 && this.stateV === 'FLIGHT' && this.ability === null);
  }
  /** isSitting(): posado en el centro, cargando una transición o aterrizando. */
  sitting(): boolean {
    return this.move === 'sit' || this.move === 'charge' || this.move === 'landing';
  }
  abilityId(): string | null {
    return this.abilityIdV;
  }
  currentAbility(): Ability | null {
    return this.ability;
  }
  age(): number {
    return this.tickCount;
  }
  random() {
    return rand;
  }

  // ------------------------------------------------------------------------------------------------------
  // Geometría

  /** Posición del dragón (dragon.position()). */
  position(): V {
    return this.flight.pos;
  }
  yaw(): number {
    return this.flight.yaw;
  }
  velocity(): V {
    return this.flight.vel;
  }
  setVelocity(v: V): void {
    this.flight.vel = v;
  }
  center(): V {
    const t = system.currentTick;
    if (this.centerCache && t - this.centerAt < 200) return this.centerCache;
    const g = groundAt(0, 0);
    if (g !== null && g > 20 && g < 200) {
      this.centerCache = new V(0.5, g + 0.5, 0.5);
      this.centerAt = t;
      if (!this.spikesSet) {
        this.flight.setSpikes(findSpikes(this.centerCache));
        this.spikesSet = true;
      }
    }
    return this.centerCache ?? new V(0.5, 65.5, 0.5);
  }
  private spikesSet = false;

  forward(): V {
    return forward(this.flight.yaw);
  }
  /** Cabeza del dragón (la parte "head" de Java está unos 6,5 bloques por delante). */
  head(): V {
    const f = this.forward();
    const lift = this.sitting() ? 0.5 : 1.5;
    return this.flight.pos.add(f.x * 6.5, lift + 0.5, f.z * 6.5);
  }
  mouth(): V {
    return this.head().add(this.forward().scale(1.2)).add(0, -0.6, 0);
  }
  /** Partes del cuerpo de Java: 3-5 cola, 6-7 alas (aproximadas a partir de la posición y el yaw). */
  part(index: number): V {
    const f = this.forward();
    const side = new V(-f.z, 0, f.x);
    const p = this.flight.pos;
    switch (index) {
      case 3:
        return p.sub(f.scale(4.5)).add(0, 0.5, 0);
      case 4:
        return p.sub(f.scale(6.5)).add(0, 0.5, 0);
      case 5:
        return p.sub(f.scale(8.5)).add(0, 0.5, 0);
      case 6:
        return p.add(side.scale(4.5)).add(0, 2, 0);
      case 7:
        return p.sub(side.scale(4.5)).add(0, 2, 0);
      default:
        return p.add(0, 2, 0);
    }
  }
  static yawTo(from: Vector3, to: Vector3): number {
    return yawTo(from, to);
  }
  static mid(e: Entity): V {
    return mid(e);
  }
  groundY(x: number, z: number): number {
    const g = groundAt(x, z);
    return g === null ? this.center().y : g;
  }
  ground(at: Vector3): V {
    return new V(at.x, this.groundY(at.x, at.z), at.z);
  }

  // ------------------------------------------------------------------------------------------------------
  // Intención de movimiento (la aplican applyIntent y el FlightController)

  fly(to: Vector3, speed: number, altitude: number): void {
    this.flyTo = V.of(to);
    this.flySpeed = speed;
    this.flyAltitude = altitude;
    this.maneuver = false;
  }
  place(p: Vector3, yaw: number): void {
    this.maneuver = true;
    this.flyTo = null;
    this.flight.place(V.of(p), yaw);
  }
  hold(faceTo: Vector3 | null, turnStep: number): void {
    let yaw = this.flight.yaw;
    if (faceTo) {
      const want = yawTo(this.flight.pos, faceTo);
      yaw += clamp(wrapDegrees(want - yaw), -turnStep, turnStep);
    }
    this.place(this.flight.pos, yaw);
  }
  launch(speed: number): void {
    const f = this.forward();
    this.flight.vel = new V(f.x * speed, 0, f.z * speed);
  }

  // ------------------------------------------------------------------------------------------------------
  // Objetivos

  targets(): Entity[] {
    const c = this.center();
    const range = 160;
    const out: Entity[] = [];
    const dim = end();
    for (const p of dim.getPlayers({ location: c, maxDistance: range })) if (validPlayer(p)) out.push(p);
    try {
      for (const e of dim.getEntities({ location: c, maxDistance: range * 1.8, tags: [TARGET_TAG] })) {
        if (alive(e) && Math.abs(e.location.y - c.y) <= 160) out.push(e);
      }
    } catch {
      /* ignorar */
    }
    return out;
  }
  static valid(e: Entity | null | undefined): e is Entity {
    if (!alive(e)) return false;
    if (e instanceof Player) return validPlayer(e);
    return true;
  }
  nearestTarget(from: Vector3, range: number): Entity | null {
    let best: Entity | null = null;
    let bestD = range * range;
    const f = V.of(from);
    for (const e of this.targets()) {
      const d = f.distanceToSqr(e.location);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }
  randomTarget(from: Vector3, range: number): Entity | null {
    const f = V.of(from);
    const list = this.targets().filter((e) => f.distanceToSqr(e.location) <= range * range);
    return rand.pick(list) ?? null;
  }
  targetsNear(point: Vector3, radius: number): Entity[] {
    const p = V.of(point);
    return this.targets().filter((e) => mid(e).distanceToSqr(p) <= radius * radius);
  }

  // ------------------------------------------------------------------------------------------------------
  // Acciones

  strike(victim: Entity, type: DamageType, damage: number, dir: Vector3 = V.ZERO, pushH = 0, pushV = 0): boolean {
    return strike(victim, type, damage, this.dragon, dir, pushH, pushV, this.head());
  }
  sound(at: Vector3, id: string, volume = 1, pitch = 1): void {
    sound(at, id, volume, pitch);
  }
  fx(model: string, at: Vector3, anims = '', scale = 1, life = 0): Effect {
    const fx = Effect.spawn(model, at, anims, scale, life);
    this.adopt(fx);
    return fx;
  }
  adopt(e: Effect | Entity): void {
    this.owned.push(e);
  }
  addTask(task: Task): void {
    this.tasks.push(task);
  }
  hasTask(pred: (t: Task) => boolean): boolean {
    return this.tasks.some(pred);
  }
  addPrison(prison: IcePrison): void {
    this.prisons.push(prison);
  }
  addWave(center: Vector3, radius: number, ticks: number, red: boolean | RGB): void {
    const color = red === true ? COLORS.red : red === false ? COLORS.purple : red;
    this.waves.push(new ParticleWave(V.of(center), radius, ticks, color));
  }
  health(): number {
    return this.dragon.getComponent('minecraft:health')?.currentValue ?? 0;
  }
  maxHealth(): number {
    return this.dragon.getComponent('minecraft:health')?.effectiveMax ?? C.MAX_HEALTH;
  }
  setHealth(value: number): void {
    try {
      this.dragon.getComponent('minecraft:health')?.setCurrentValue(Math.max(1, Math.min(this.maxHealth(), value)));
    } catch {
      /* ignorar */
    }
  }
  heal(amount: number): void {
    const max = this.maxHealth();
    const cap = this.wrath() ? max * C.WRATH_HEALTH_CAP : max;
    const to = Math.min(cap, this.health() + amount);
    if (to > this.health()) this.setHealth(to);
  }
  immuneFor(ticks: number): void {
    this.immuneTicks = Math.max(this.immuneTicks, ticks);
  }
  log(msg: string): void {
    if (DEBUG.on) console.warn(`[improvedragon] ${msg}`);
  }
  /** Ataque ligero durante una especial. */
  lightAttack(): Ability {
    const roll = rand.nextDouble();
    const wrath = this.wrath();
    if (roll < 0.15 && this.nearestTarget(this.flight.pos, C.RUSH_RANGE) !== null) {
      return createAbility(wrath ? 'verdugo' : 'rush')!;
    }
    return roll < 0.4 ? createAbility(wrath ? 'death_beam' : 'enderbeam')! : new FireballVolley();
  }
  /** Ocultar el dragón (Cacería del Eclipse, Último Aliento). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    try {
      if (hidden) this.dragon.addEffect('invisibility', 20000000, { showParticles: false });
      else this.dragon.removeEffect('invisibility');
    } catch {
      /* el dragón ignora efectos: se aparta igualmente */
    }
  }
  isHidden(): boolean {
    return this.hidden;
  }

  // ------------------------------------------------------------------------------------------------------
  // Tick

  tick(): void {
    if (!this.dragon.isValid) return;
    if (!this.loaded) this.load();
    this.tickCount++;
    this.waves = this.waves.filter((w) => !w.tick());
    if (this.deathHandledV) {
      this.applyIntent();
      return;
    }
    this.flyTo = null;
    this.maneuver = false;
    if (this.immuneTicks > 0) this.immuneTicks--;
    if (this.wrath()) {
      const cap = this.maxHealth() * C.WRATH_HEALTH_CAP;
      if (this.health() > cap) this.setHealth(cap);
      if (this.tickCount % 2 === 0) headAura(this.head());
    }
    this.checkThresholds();
    this.tickConstellationHeal();
    this.tickTasks();
    this.prisons = this.prisons.filter((p) => !p.tick());
    this.tickThrown();
    this.tickBoosts();
    this.owned = this.owned.filter((e) => (e instanceof Effect ? e.valid : e.isValid));
    this.sweepOrphans();
    if (this.ability) {
      const a = this.ability;
      if (a.tick(this) && this.ability === a) this.finishAbility();
    }
    this.tickSchedule();
    if (this.activePhaseV >= 2) this.tickPassives();
    else this.tickPhase1();
    this.applyIntent();
    if (++this.saveTimer >= 20) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private tickTasks(): void {
    for (let i = 0; i < this.tasks.length; i++) {
      if (this.tasks[i].tick(this)) this.tasks.splice(i--, 1);
    }
  }

  private tickConstellationHeal(): void {
    // Los cristales de la Constelación (y los del miedo) curan como un cristal del End más el bonus.
    const p = this.flight.pos;
    let near = false;
    if (!near) {
      for (const e of this.owned) {
        if (e instanceof Effect && e.valid && (e.model === 'constellation_crystal' || e.model === 'fear_crystal' || e.model === 'fear_core') && e.position().distanceToSqr(p) < 32 * 32) {
          near = true;
          if (this.tickCount % 4 === 0) beam(e.position(), this.head(), COLORS.pink);
          break;
        }
      }
    }
    if (near) {
      this.crystalHeal += 0.1 * (1 + C.CONSTELLATION_HEAL_BONUS);
      if (this.crystalHeal >= 1) {
        this.heal(Math.floor(this.crystalHeal));
        this.crystalHeal -= Math.floor(this.crystalHeal);
      }
    }
  }

  private checkThresholds(): void {
    const ratio = this.health() / this.maxHealth();
    const nowPhase = ratio <= C.PHASE4_THRESHOLD ? 4 : ratio <= C.PHASE3_THRESHOLD ? 3 : ratio <= C.PHASE2_THRESHOLD ? 2 : 1;
    if (nowPhase > this.reachedPhaseV) {
      this.reachedPhaseV = nowPhase;
      this.log(`umbral: fase ${nowPhase} alcanzada con ${Math.floor(this.health())} HP`);
      if (nowPhase === 4 && this.activePhaseV < 4) {
        this.pendingTransitionV = 4;
      } else if (this.activePhaseV < 2) {
        this.pendingTransitionV = 2;
      } else if (nowPhase === 3 && this.activePhaseV === 2) {
        this.activePhaseV = 3;
        this.f3Started = false;
        this.queue = [];
        this.f3Burst();
        if (!this.specialRunning()) this.f3Switch = true;
      }
      this.save();
    }
    if (this.pendingTransitionV !== 0 && !this.specialRunning()) {
      if (this.stateV !== 'TRANSITION') {
        this.log(`transición a fase ${this.pendingTransitionV}: corta lo que estuviera haciendo`);
        this.cancelAbilities();
        this.stateV = 'TRANSITION';
        this.step = null;
        this.queue = [];
      }
      this.ensureHeadingToCenter();
    }
  }

  private f3Burst(): void {
    const at = this.flight.pos;
    particle(PART.explosionEmitter, at.add(0, 2, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      particle(PART.explosionEmitter, at.add(Math.cos(a) * 7, 1, Math.sin(a) * 7));
    }
    particle(PART.endRod, at.add(0, 2, 0), 30, 5);
    dust(at.add(0, 2, 0), COLORS.white, 120, new V(6, 4, 6));
    this.waves.push(new ParticleWave(at, 30, 30, COLORS.white));
    this.sound(at, 'random.explode', 8, 0.6);
    this.sound(at, 'mob.enderdragon.growl', 8, 1.2);
  }

  private ensureHeadingToCenter(): void {
    this.goScripted();
    if (this.move === 'charge') return;
    const c = this.center();
    const p = this.flight.pos;
    const flat = Math.hypot(p.x - c.x, p.z - c.z);
    if (this.move === 'sit' || this.move === 'landing') {
      if (this.move === 'sit') this.startCharge();
      return;
    }
    if (flat < 6 && p.y - c.y < 12) {
      this.move = 'landing';
    } else {
      this.fly(c.add(0, 8, 0), C.PASS_SPEED, -1);
    }
  }

  // ---- carga de transición (TransitionChargePhase)

  private startCharge(): void {
    const variant = Math.max(2, this.pendingTransitionV);
    this.move = 'charge';
    this.chargeVariant = variant;
    this.chargeTicks = 0;
    this.chargeTotal = variant === 4 ? C.T34_CHARGE_TICKS : C.T12_CHARGE_TICKS;
    this.chargeRings?.remove();
    this.chargeRings = Effect.spawn(variant === 4 ? 'charge_rings_red' : 'charge_rings_purple', this.flight.pos, 'contract', variant === 4 ? 1.6666666 : 1, this.chargeTotal + 5).follow(this.dragon, POSITION, 0);
    this.sound(this.flight.pos, 'beacon.activate', 8, variant === 4 ? 0.6 : 0.9);
    this.sound(this.flight.pos, 'beacon.ambient', 8, 0.5);
  }

  private tickCharge(): void {
    if (this.pendingTransitionV === 4 && this.chargeVariant === 2) this.startCharge();
    const red = this.chargeVariant === 4;
    const center = this.flight.pos.add(0, 2, 0);
    this.chargeTicks++;
    if (this.chargeTicks % 20 === 1) contractingRing(center, red ? 20 : 12, 48, Math.floor(this.chargeTicks / 20) % 2 === 1, red ? COLORS.red : COLORS.purple);
    if (red && this.chargeTicks % 40 === 0) {
      ringWave(center, 30, 20, COLORS.red);
      bigCircle(center, 18 + (this.chargeTicks % 80 === 0 ? 8 : 0), COLORS.red);
    }
    if (this.chargeTicks % 5 === 0) dust(center, red ? COLORS.red : COLORS.purple, 6, new V(2.5, 1.5, 2.5));
    if (this.chargeTicks >= this.chargeTotal) this.releaseCharge(center);
  }

  private releaseCharge(center: V): void {
    const v4 = this.chargeVariant === 4;
    this.sound(this.flight.pos, 'mob.enderdragon.growl', 10, v4 ? 0.5 : 0.7);
    this.sound(this.flight.pos, 'random.explode', 8, 0.6);
    particle(PART.explosionEmitter, center, 3, 2);
    if (v4) {
      const radius = C.T34_RADIUS;
      Effect.spawn('shockwave_red', center.sub(0, 1.5, 0), 'expand', radius / 40, 40);
      this.addWave(center, radius, 30, true);
      groundDust(center, radius, 80);
      this.shockwave(center, 0, radius, C.T34_DAMAGE, C.T34_PUSH_H, C.T34_PUSH_V, DT.RAGE_EXPLOSION, true);
    } else {
      const radius = C.T12_RADIUS;
      const near = C.T12_NEAR_RADIUS;
      Effect.spawn('shockwave_purple', center.sub(0, 1.5, 0), 'expand', radius / 40, 40);
      this.addWave(center, radius, 25, false);
      groundDust(center, radius, 60);
      const playersOnly = !C.WAVES_HIT_MOBS;
      this.shockwave(center, 0, near, C.T12_DAMAGE_NEAR, C.T12_PUSH_H * 2, C.T12_PUSH_V * 2, DT.SHOCKWAVE, playersOnly);
      this.shockwave(center, near, radius, C.T12_DAMAGE_FAR, C.T12_PUSH_H, C.T12_PUSH_V, DT.SHOCKWAVE, playersOnly);
    }
    this.chargeRings?.remove();
    this.chargeRings = null;
    this.completeTransition(this.chargeVariant);
    this.takeoff();
  }

  /** Shockwave.perform: daño y empuje en un anillo [minRadius, radius]. */
  shockwave(center: Vector3, minRadius: number, radius: number, damage: number, pushH: number, pushV: number, type: DamageType, playersOnly: boolean): void {
    const c = V.of(center);
    const dim = end();
    let list: Entity[] = [];
    try {
      list = dim.getEntities({ location: c, maxDistance: radius, excludeFamilies: ['improvedragon_fx', 'inanimate'], excludeTypes: ['minecraft:ender_dragon', 'minecraft:item', 'minecraft:xp_orb'] });
    } catch {
      list = [];
    }
    for (const victim of list) {
      if (!alive(victim)) continue;
      if (victim instanceof Player) {
        if (!validPlayer(victim)) continue;
      } else if (playersOnly) continue;
      if (!victim.getComponent('minecraft:health')) continue;
      const d2 = c.distanceToSqr(victim.location);
      if (d2 > radius * radius || (minRadius > 0 && d2 < minRadius * minRadius)) continue;
      const dir = V.of(victim.location).sub(c);
      strike(victim, type, damage, this.dragon, dir, pushH, pushV, c);
    }
  }

  completeTransition(variant: number): void {
    this.log(`transición a fase ${variant} completada`);
    this.pendingTransitionV = 0;
    const target = variant === 4 ? 4 : Math.min(3, Math.max(2, this.reachedPhaseV));
    if (target > this.activePhaseV) this.activePhaseV = target;
    if (this.reachedPhaseV >= 4 && this.activePhaseV < 4) this.pendingTransitionV = 4;
    if (this.roarTimer < 0) this.roarTimer = rand.roll(C.ROAR_MIN, C.ROAR_MAX);
    if (this.activePhaseV >= 4) this.activatePearl();
    this.stateV = 'NONE';
    this.step = null;
    this.queue = [];
    this.save();
  }

  // ---- plan de estados

  private plan(): void {
    this.queue = [];
    switch (this.activePhaseV) {
      case 2:
        this.queue.push(this.flightStep(C.F2_FLIGHT_MIN, C.F2_FLIGHT_MAX));
        this.queue.push(this.centerStep(1, C.F2_CENTER_MIN, C.F2_CENTER_MAX));
        this.queue.push(this.flightStep(C.F2_FLIGHT_MIN, C.F2_FLIGHT_MAX));
        this.queue.push(this.centerStep(2, C.F2_CENTER_MIN, C.F2_CENTER_MAX));
        this.queue.push({ kind: 'SPECIAL', ticks: 0, count: 0, pool: 0, special: 'eclipse', burst: false });
        break;
      case 3:
        this.f3Started = true;
        for (let pool = 1; pool <= 2; pool++) {
          this.queue.push({ kind: 'PHYSICAL', ticks: rand.roll(C.F3_PHYSICAL_MIN, C.F3_PHYSICAL_MAX), count: 0, pool: 0, special: null, burst: false });
          this.queue.push(this.centerStep(pool, C.F3_CENTER_MIN, C.F3_CENTER_MAX));
          const f = this.flightStep(C.F3_FLIGHT_MIN, C.F3_FLIGHT_MAX);
          this.queue.push({ ...f, pool });
          this.queue.push(this.centerStep(pool, C.F3_CENTER_MIN, C.F3_CENTER_MAX));
        }
        this.queue.push({ kind: 'SPECIAL', ticks: 0, count: 0, pool: 0, special: 'eclipse', burst: false });
        break;
      default: {
        const near = this.targetsNear(this.center(), C.F4_NEAR_RADIUS).length > 0;
        for (let loop = 0; loop < 2; loop++) {
          const physical: Step = { kind: 'PHYSICAL', ticks: rand.roll(C.F4_PHYSICAL_MIN, C.F4_PHYSICAL_MAX), count: 0, pool: 0, special: null, burst: false };
          const flight: Step = { kind: 'FLIGHT', ticks: C.F4_FLIGHT_TIMER, count: rand.roll(C.F4_FLIGHT_COUNT_MIN, C.F4_FLIGHT_COUNT_MAX), pool: 0, special: null, burst: true };
          const centerTicks = rand.roll(C.F4_CENTER_MIN, C.F4_CENTER_MAX);
          const centerCount = centerTicks <= C.F4_CENTER_SPLIT ? 1 + rand.nextInt(3) : 2 + rand.nextInt(4);
          const center: Step = { kind: 'CENTER', ticks: centerTicks, count: centerCount, pool: 4, special: null, burst: false };
          this.queue.push(near ? physical : flight, center, near ? flight : physical);
        }
        this.queue.push({ kind: 'SPECIAL', ticks: 0, count: 0, pool: 0, special: 'blood_moon', burst: false });
      }
    }
    this.log(`plan fase ${this.activePhaseV}: ${this.queue.map((s) => s.kind).join(' > ')}`);
  }

  private flightStep(min: number, max: number): Step {
    return { kind: 'FLIGHT', ticks: rand.roll(min, max), count: rand.roll(C.F2_FLIGHT_COUNT_MIN, C.F2_FLIGHT_COUNT_MAX), pool: 0, special: null, burst: false };
  }
  private centerStep(pool: number, min: number, max: number): Step {
    return { kind: 'CENTER', ticks: rand.roll(min, max), count: rand.roll(C.CENTER_COUNT_MIN, C.CENTER_COUNT_MAX), pool, special: null, burst: false };
  }

  private tickSchedule(): void {
    if (this.activePhaseV < 2 || this.stateV === 'TRANSITION') return;
    if (this.f3Switch && this.ability === null && !this.physical.attacking()) {
      this.f3Switch = false;
      this.log('transición 2->3: cierra el estado');
      this.endStep();
    }
    if (this.step === null) {
      if (this.ability !== null) return;
      if (this.queue.length === 0) this.plan();
      this.enter(this.queue.shift()!);
    }
    const s = this.step!;
    switch (s.kind) {
      case 'FLIGHT':
        this.tickFlightStep(s);
        break;
      case 'CENTER':
        this.tickCenter(s);
        break;
      case 'PHYSICAL':
        this.tickPhysical();
        break;
      case 'SPECIAL':
        if (this.ability === null) this.endStep();
        break;
    }
  }

  private enter(s: Step): void {
    this.step = s;
    this.elapsed = 0;
    this.castIndex = 0;
    this.landed = false;
    this.log(`estado: ${s.kind} (${s.ticks} t, ${s.count} habilidades, pool ${s.pool})`);
    switch (s.kind) {
      case 'FLIGHT':
        this.stateV = 'FLIGHT';
        this.stepTicks = s.ticks;
        this.castAt = this.spread(s.count, s.ticks);
        this.burstLeft = s.burst ? 2 : 0;
        this.burstTimer = 20;
        if (this.sitting()) this.takeoff();
        break;
      case 'CENTER':
        this.stateV = 'CENTER';
        break;
      case 'PHYSICAL':
        this.stateV = 'PHYSICAL';
        this.stepTicks = s.ticks;
        this.physical.begin();
        if (this.sitting()) this.takeoff();
        break;
      case 'SPECIAL':
        this.stateV = 'SPECIAL';
        this.cast(s.special!, true);
        break;
    }
  }

  private endStep(): void {
    if (this.step?.kind === 'PHYSICAL') this.physical.end();
    if (this.step?.kind === 'CENTER' && this.sitting()) this.takeoff();
    this.step = null;
    this.stateV = 'NONE';
  }

  private spread(count: number, ticks: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < Math.max(0, count); i++) {
      const slot = ticks / count;
      out.push(Math.floor(slot * i + slot * (0.15 + rand.nextDouble() * 0.7)));
    }
    return out.sort((a, b) => a - b);
  }

  /** flyingFree(): vuelo libre (patrón de espera o pasada). */
  private flyingFree(): boolean {
    return this.move === 'hold' || this.move === 'strafe';
  }

  private tickFlightStep(s: Step): void {
    if (this.ability !== null) return;
    if (this.burstLeft > 0) {
      if (--this.burstTimer <= 0 && this.flyingFree()) {
        this.castFlight(0);
        this.burstLeft--;
        this.burstTimer = C.F4_FLIGHT_BURST_GAP;
      }
      return;
    }
    this.elapsed++;
    if (this.castIndex < this.castAt.length && this.elapsed >= this.castAt[this.castIndex] && this.flyingFree()) {
      this.castIndex++;
      this.castFlight(s.pool);
    } else if (this.elapsed >= this.stepTicks) {
      this.endStep();
    }
  }

  private castFlight(pool: number): void {
    const kit = this.wrath() ? WRATH_FLIGHT : DRACONIC_FLIGHT;
    const weights = pool === 1 ? parseWeights(C.F3_FLIGHT_POOL1) : pool === 2 ? parseWeights(C.F3_FLIGHT_POOL2) : this.wrath() ? parseWeights(C.WRATH_FLIGHT_WEIGHTS) : null;
    const id = pick(kit, this.lastFlight, weights);
    this.lastFlight = id;
    this.cast(id, false);
  }

  private tickCenter(s: Step): void {
    if (!this.landed) {
      if (this.move === 'sit') {
        this.landed = true;
        const crystals = this.crystalsAlive();
        this.stepTicks = Math.max(0, s.ticks - crystals * C.CRYSTAL_PENALTY);
        this.castAt = this.spread(s.count, s.ticks);
        this.log(`centro: ${this.stepTicks} ticks (${crystals} pilares con cristal), ${s.count} habilidades`);
      } else if (this.move !== 'approach' && this.move !== 'landing') {
        this.move = 'approach';
      }
      return;
    }
    if (this.move !== 'sit' && this.ability === null) this.sitHere();
    if (this.ability !== null) return;
    this.elapsed++;
    if (this.castIndex < this.castAt.length && this.elapsed >= this.castAt[this.castIndex] && this.elapsed < this.stepTicks) {
      this.castIndex++;
      const kit = s.pool === 4 ? WRATH_CENTER : DRACONIC_CENTER;
      const spec = s.pool === 4 ? C.WRATH_CENTER_WEIGHTS : s.pool === 1 ? C.POOL1_WEIGHTS : C.POOL2_WEIGHTS;
      const id = pick(kit, this.lastCenter, parseWeights(spec));
      this.lastCenter = id;
      this.cast(id, false);
    } else if (this.elapsed >= this.stepTicks) {
      this.endStep();
    }
  }

  private tickPhysical(): void {
    if (this.ability !== null) return;
    if (this.physical.tick()) {
      this.elapsed++;
      if (this.elapsed >= this.stepTicks) this.endStep();
    }
  }

  cast(id: string, special: boolean): boolean {
    const a = createAbility(id);
    if (!a) return false;
    this.goScripted();
    this.ability?.cancel?.(this);
    this.physical.cancel();
    this.log(`habilidad ${id}${special ? ' (especial)' : ''}`);
    this.ability = a;
    this.abilityIdV = id;
    this.abilityIsSpecial = special;
    a.start(this);
    return true;
  }

  replaceAbility(id: string): void {
    const a = createAbility(id);
    if (!a) {
      this.ability = null;
      return;
    }
    this.log(`habilidad ${id} en su lugar`);
    this.ability = a;
    this.abilityIdV = id;
    a.start(this);
  }

  private finishAbility(): void {
    this.log(`habilidad ${this.abilityIdV} terminada`);
    this.ability = null;
    this.abilityIdV = null;
    this.abilityIsSpecial = false;
  }

  // ---- pasivas

  private tickPassives(): void {
    if (!this.sitting() && this.tickCount % C.FLAP_PERIOD === 0) this.wingFlap();
    if (this.roarTimer < 0) this.roarTimer = rand.roll(C.ROAR_MIN, C.ROAR_MAX);
    if (--this.roarTimer <= 0) {
      this.roarTimer = rand.roll(C.ROAR_MIN, C.ROAR_MAX);
      if (this.pendingTransitionV === 0 && this.move !== 'charge') this.roar();
    }
    if (this.wrath()) this.tickPearl();
  }

  private wingFlap(): void {
    const radius = C.FLAP_RADIUS;
    const body = this.flight.pos.add(0, 4 * 0.5, 0);
    let list: Entity[] = [];
    try {
      list = end().getEntities({ location: body, maxDistance: radius + 1, excludeFamilies: ['improvedragon_fx', 'inanimate'], excludeTypes: ['minecraft:ender_dragon', 'minecraft:item', 'minecraft:xp_orb'] });
    } catch {
      list = [];
    }
    for (const victim of list) {
      if (victim instanceof Player && !validPlayer(victim)) continue;
      if (!victim.getComponent('minecraft:health')) continue;
      if (V.of(victim.location).distanceToSqr(body) > radius * radius) continue;
      strike(victim, DT.WING_FLAP, C.FLAP_DAMAGE, this.dragon);
    }
  }

  roar(): void {
    this.log('rugido');
    const center = this.flight.pos.add(0, 1, 0);
    this.sound(center, 'mob.enderdragon.growl', 6, 0.8);
    const radius = C.ROAR_RADIUS;
    this.shockwave(center, 0, radius, C.ROAR_DAMAGE, 1.6, 0.7, DT.ROAR, !C.WAVES_HIT_MOBS);
    ringWave(center, radius, 8, COLORS.purple);
    this.addWave(center, radius, 6, false);
    particle(PART.sonicBoom, center);
  }

  private activatePearl(): void {
    this.pearlActive = C.PEARL_DURATION;
    this.pearlCooldown = C.PEARL_COOLDOWN;
    this.pearlNext = rand.roll(C.PEARL_TP_MIN, C.PEARL_TP_MAX);
  }

  private tickPearl(): void {
    if (this.pearlCooldown > 0) this.pearlCooldown--;
    else if (this.pearlActive <= 0) this.activatePearl();
    if (this.pearlActive > 0) {
      this.pearlActive--;
      const free = this.stateV === 'FLIGHT' && this.ability === null && this.pendingTransitionV === 0 && this.flyingFree();
      if (--this.pearlNext <= 0 && free) {
        this.pearlNext = rand.roll(C.PEARL_TP_MIN, C.PEARL_TP_MAX);
        const c = this.center();
        const angle = rand.nextDouble() * Math.PI * 2;
        const radius = 40 + rand.nextDouble() * 30;
        const y = c.y + 30 + rand.nextDouble() * 25;
        this.teleport(new V(c.x + Math.cos(angle) * radius, y, c.z + Math.sin(angle) * radius));
      }
    }
  }

  teleport(to: V): void {
    this.log(`teletransporte a ${to}`);
    const from = this.flight.pos;
    teleportBurst(from);
    Effect.spawn('pearl_portal', from.sub(0, 8, 0), 'blink', 3, 18);
    this.sound(from, 'mob.endermen.portal', 6, 0.5);
    this.flight.place(to, this.flight.yaw);
    this.holdTarget = null;
    teleportBurst(to);
    Effect.spawn('pearl_portal', to.sub(0, 8, 0), 'blink', 3, 18);
    this.sound(to, 'mob.endermen.portal', 6, 0.5);
  }

  // ---- fase 1 "vanilla+": IA de Bedrock con ráfagas de bolas de fuego

  private tickPhase1(): void {
    if (this.move !== 'vanilla') return;
    // La pasada vanilla dispara una bola: el script la convierte en una ráfaga (BurstStrafePhase).
    if (this.strafeBurst > 0) {
      const target = this.strafeTarget;
      if (!Brain.valid(target)) {
        this.strafeBurst = 0;
        return;
      }
      if (this.tickCount % 3 === 0) {
        const total = Math.max(1, C.FIREBALL_BURST);
        const index = total - this.strafeBurst;
        const spreadA = (index - (total - 1) / 2) * 0.15;
        const head = this.head();
        const aim = mid(target).sub(head).yRot(spreadA);
        shootFireball(this.dragon, head, aim);
        this.strafeBurst--;
      }
    }
  }

  /** Lo llama main.ts cuando la IA vanilla dispara una bola en la fase 1. */
  onVanillaFireball(): void {
    if (this.activePhaseV >= 2 || this.strafeBurst > 0) return;
    const t = this.nearestTarget(this.flight.pos, 128);
    if (!t) return;
    this.strafeTarget = t;
    this.strafeBurst = Math.max(0, C.FIREBALL_BURST - 1);
  }

  // ------------------------------------------------------------------------------------------------------
  // Movimiento

  /** Pasa al control por script (fin de la IA vanilla). */
  goScripted(): void {
    if (this.scripted) return;
    this.scripted = true;
    this.flight.pos = V.of(this.dragon.location);
    this.flight.yaw = this.dragon.getRotation().y;
    this.flight.vel = V.ZERO;
    try {
      this.dragon.triggerEvent('improvedragon:scripted');
    } catch {
      /* ignorar */
    }
    if (this.move === 'vanilla') this.move = 'hold';
  }

  private takeoff(): void {
    this.move = 'hold';
    this.holdTarget = null;
    const f = this.forward();
    this.flight.vel = new V(f.x * 0.4, 0.25, f.z * 0.4);
  }

  private sitHere(): void {
    this.move = 'sit';
    this.flight.vel = V.ZERO;
  }

  private crystalsAlive(): number {
    try {
      const c = this.center();
      return end()
        .getEntities({ type: 'minecraft:ender_crystal', location: c, maxDistance: 70 })
        .filter((e) => e.location.y > c.y + 10).length;
    } catch {
      return 0;
    }
  }

  private applyIntent(): void {
    if (!this.scripted) {
      // Fase 1: manda la IA de Bedrock; el script solo sigue su posición.
      this.flight.pos = V.of(this.dragon.location);
      this.flight.yaw = this.dragon.getRotation().y;
      return;
    }
    if (this.deathHandledV) {
      this.teleportDragon();
      return;
    }
    if (this.maneuver) {
      this.flight.clear();
    } else if (this.flyTo) {
      this.leaveSit();
      this.flight.apply(this.flyTo, this.flySpeed, this.flyAltitude, this.center(), C.TURN_BOOST);
    } else {
      this.freeMove();
    }
    this.teleportDragon();
  }

  private leaveSit(): void {
    if (this.move === 'sit' || this.move === 'landing' || this.move === 'approach') this.move = 'hold';
  }

  private freeMove(): void {
    const c = this.center();
    if (this.move === 'charge') {
      this.flight.place(this.flight.pos, this.flight.yaw);
      this.tickCharge();
      return;
    }
    if (this.pendingTransitionV === 0 && this.stateV === 'CENTER' && this.move !== 'sit' && this.move !== 'landing' && !this.landed) this.move = 'approach';
    if (this.pendingTransitionV === 0 && this.stateV !== 'CENTER' && (this.move === 'sit' || this.move === 'approach' || this.move === 'landing')) this.takeoff();
    switch (this.move) {
      case 'approach': {
        const p = this.flight.pos;
        const flat = Math.hypot(p.x - c.x, p.z - c.z);
        if (flat < 6 && p.y - c.y < 12) this.move = 'landing';
        else this.flight.apply(c.add(0, 8, 0), C.PASS_SPEED, -1, c, C.TURN_BOOST);
        break;
      }
      case 'landing': {
        const p = this.flight.pos;
        const d = c.sub(p);
        if (d.length() < 1) {
          this.flight.place(c, this.flight.yaw);
          if (this.pendingTransitionV !== 0 && !this.specialRunning()) this.startCharge();
          else this.sitHere();
        } else {
          const step = d.normalize().scale(Math.min(0.5, d.length()));
          this.flight.place(p.add(step), this.flight.yaw);
        }
        break;
      }
      case 'sit': {
        const t = this.nearestTarget(this.flight.pos, 64);
        const yaw = t ? this.flight.yaw + clamp(wrapDegrees(yawTo(this.flight.pos, t.location) - this.flight.yaw), -2, 2) : this.flight.yaw;
        this.flight.place(this.flight.pos, yaw);
        break;
      }
      case 'strafe':
        this.tickStrafe(c);
        break;
      default:
        this.tickHold(c);
    }
  }

  /** Patrón de espera (ErraticHoldingPhase): nodos en dos anillos alrededor del podio. */
  private tickHold(c: V): void {
    const p = this.flight.pos;
    const d = this.holdTarget ? this.holdTarget.distanceToSqr(p) : 0;
    if (!this.holdTarget || d < 100 || d > 22500 || --this.holdRetarget <= 0) {
      const arrived = this.holdTarget !== null && d < 100;
      this.holdRetarget = 40 + rand.nextInt(41);
      if (arrived && this.allowsStrafe() && rand.nextInt(Math.max(1, C.STRAFE_ODDS)) === 0) {
        const t = this.nearestTarget(c, 150);
        if (t) {
          this.move = 'strafe';
          this.strafeTarget = t;
          this.strafeCharge = 0;
          this.strafeBurst = 0;
          return;
        }
      }
      if (rand.nextInt(4) === 0) this.holdClockwise = !this.holdClockwise;
      const inner = rand.nextInt(4) === 0;
      const radius = inner ? 40 : 60;
      const cur = Math.atan2(p.z - c.z, p.x - c.x);
      const step = ((Math.PI * 2) / (inner ? 8 : 12)) * (this.holdClockwise ? 1 : -1);
      const a = cur + step;
      const baseY = Math.max(c.y + 10, this.groundY(c.x + Math.cos(a) * radius, c.z + Math.sin(a) * radius) + 10);
      this.holdTarget = new V(c.x + Math.cos(a) * radius, baseY + rand.nextDouble() * 30, c.z + Math.sin(a) * radius);
    }
    this.flight.apply(this.holdTarget, 1.0, -1, c, 1);
  }

  /** Pasada con ráfaga de bolas (BurstStrafePhase). */
  private tickStrafe(c: V): void {
    const t = this.strafeTarget;
    if (!Brain.valid(t) || !this.allowsStrafe()) {
      this.move = 'hold';
      this.holdTarget = null;
      return;
    }
    if (this.strafeBurst > 0) {
      const total = Math.max(1, C.FIREBALL_BURST);
      const index = total - this.strafeBurst;
      const spreadA = (index - (total - 1) / 2) * 0.15;
      const head = this.head();
      const aim = mid(t).sub(head).yRot(spreadA);
      shootFireball(this.dragon, head, aim);
      if (--this.strafeBurst <= 0) {
        this.move = 'hold';
        this.holdTarget = null;
      }
      this.flight.apply(this.flight.pos.add(this.forward().scale(10)), 1.0, -1, c, 1);
      return;
    }
    const tp = V.of(t.location);
    const dist = tp.flatDistanceTo(this.flight.pos);
    const up = Math.min(0.4 + dist / 80 - 1, 10);
    this.flight.apply(new V(tp.x, tp.y + up + 6, tp.z), 1.0, -1, c, 1);
    if (tp.distanceToSqr(this.flight.pos) < 4096) {
      this.strafeCharge++;
      const to = tp.sub(this.flight.pos).flat().normalize();
      const angle = Math.acos(clamp(this.forward().dot(to), -1, 1)) * DEG + 0.5;
      if (this.strafeCharge >= 3 && angle < 10) {
        this.strafeBurst = Math.max(1, C.FIREBALL_BURST);
        this.strafeCharge = 0;
        this.sound(this.flight.pos, 'mob.enderdragon.growl', 4, 1.2);
      }
    } else if (this.strafeCharge > 0) this.strafeCharge--;
    if (tp.distanceToSqr(this.flight.pos) < 16) {
      this.move = 'hold';
      this.holdTarget = null;
    }
  }

  private teleportDragon(): void {
    try {
      this.dragon.teleport(this.flight.pos, { rotation: { x: 0, y: this.flight.yaw } });
    } catch {
      /* fuera de carga */
    }
  }

  // ------------------------------------------------------------------------------------------------------
  // Lanzamientos, estampados y agarres

  addThrown(victim: Entity, damage: number, waveDamage: number, waveRadius: number, trueWave: boolean): void {
    this.thrown.push({ victim, ticks: 0, damage, waveDamage, waveRadius, trueWave });
    THROWN.add(victim.id);
  }

  private tickThrown(): void {
    this.thrown = this.thrown.filter((t) => {
      const v = t.victim;
      t.ticks++;
      if (!alive(v)) {
        THROWN.delete(t.victim.id);
        return false;
      }
      if ((t.ticks > 2 && onGround(v)) || t.ticks > 100) {
        this.slam(t);
        THROWN.delete(v.id);
        return false;
      }
      return true;
    });
  }

  private slam(t: Thrown): void {
    const victim = t.victim;
    const at = V.of(victim.location);
    this.sound(at, 'random.explode', 6, 0.7);
    particle(PART.explosion, at.add(0, 0.5, 0), 3, 1);
    particle(PART.cloud, at.add(0, 0.3, 0), 10, t.waveRadius * 0.4);
    this.strike(victim, DT.GRAB_SLAM, t.damage);
    for (const e of this.targetsNear(at.add(0, 1, 0), t.waveRadius)) {
      if (e.id !== victim.id) this.strike(e, t.trueWave ? DT.GRAB_SLAM : DT.SLAM, t.waveDamage, V.of(e.location).sub(at), 1.4, 0.5);
    }
  }

  /** Lanza hacia arriba unos `height` bloques (launchUp). */
  launchUp(victim: Entity, height: number): void {
    try {
      victim.getComponent('minecraft:riding')?.entityRidingOn?.getComponent('minecraft:rideable')?.ejectRider(victim);
    } catch {
      /* ignorar */
    }
    const ticks = 1 + Math.max(0, Math.round((height - 61) / 3.9));
    this.boosts.push({ victim, ticks });
    THROWN.add(victim.id);
    system.runTimeout(() => THROWN.delete(victim.id), 200);
    boost(victim);
  }

  private tickBoosts(): void {
    this.boosts = this.boosts.filter((b) => {
      if (alive(b.victim) && --b.ticks > 0) {
        boost(b.victim);
        return true;
      }
      return false;
    });
  }

  /** Crea un asiento de agarre en la boca. */
  newSeat(): Seat {
    return Seat.create(grabMouth(this));
  }

  // ------------------------------------------------------------------------------------------------------
  // Limpieza

  private sweepOrphans(): void {
    if (this.ability !== null || this.physical.attacking() || this.tasks.length > 0) return;
    this.owned = this.owned.filter((e) => {
      if (e instanceof Effect && e.infinite()) {
        this.log(`huérfano: ${e.model} quitado`);
        e.remove();
        return false;
      }
      return true;
    });
  }

  private cancelAbilities(): void {
    if (this.ability) {
      this.ability.cancel?.(this);
      this.ability = null;
      this.abilityIdV = null;
      this.abilityIsSpecial = false;
    }
    this.physical.cancel();
    for (const t of this.tasks) t.cancel?.(this);
    this.tasks = [];
    for (const e of this.owned) {
      try {
        if (e instanceof Effect) e.remove();
        else if (e.isValid) e.remove();
      } catch {
        /* ignorar */
      }
    }
    this.owned = [];
  }

  cancelAll(): void {
    this.cancelAbilities();
    for (const p of this.prisons) p.dissolve();
    this.prisons = [];
    for (const t of this.thrown) THROWN.delete(t.victim.id);
    this.thrown = [];
    this.step = null;
    this.f3Switch = false;
    this.queue = [];
    if (this.stateV !== 'TRANSITION') this.stateV = 'NONE';
  }

  unload(): void {
    this.cancelAll();
    this.chargeRings?.remove();
    this.save();
  }

  // ------------------------------------------------------------------------------------------------------
  // Muerte

  /** Golpe letal: empieza el Último Aliento (la muerte vanilla espera a la explosión). */
  beginDeath(): void {
    if (this.deathHandledV) return;
    this.deathHandledV = true;
    this.log('muerte: Último Aliento');
    this.goScripted();
    this.cancelAll();
    this.chargeRings?.remove();
    this.stateV = 'NONE';
    this.setHealth(1);
    // Oculto y apartado por encima de la Luna Negra mientras dura el Último Aliento.
    this.flight.place(this.center().add(0, 90, 0), this.flight.yaw);
    this.save();
    DEATH_HOOK.begin?.(this);
  }

  /** Fin del Último Aliento: muerte vanilla (portal, huevo y experiencia). */
  finishDeath(): void {
    this.allowDeath = true;
    // Sigue oculto, como en Java (BossDragonRenderer no dibuja al dragón muerto).
    this.flight.place(this.center().add(0, 20, 0), this.flight.yaw);
    this.teleportDragon();
    try {
      this.dragon.triggerEvent('improvedragon:vanilla');
      this.dragon.applyDamage(this.health() + 100000, { cause: EntityDamageCause.override });
    } catch {
      try {
        this.dragon.kill();
      } catch {
        /* ignorar */
      }
    }
  }

  // ------------------------------------------------------------------------------------------------------
  // Comandos

  forcePhase(phase: number): void {
    this.cancelAll();
    this.goScripted();
    this.reachedPhaseV = Math.max(this.reachedPhaseV, phase);
    this.activePhaseV = phase;
    this.pendingTransitionV = 0;
    this.f3Started = false;
    this.stateV = 'NONE';
    if (this.move === 'charge') this.move = 'hold';
    this.chargeRings?.remove();
    if (phase >= 4) this.activatePearl();
    this.save();
  }

  forceState(which: string): void {
    this.cancelAll();
    this.goScripted();
    let s: Step;
    if (which === 'center') {
      s = this.wrath() ? { kind: 'CENTER', ticks: 400, count: 3, pool: 4, special: null, burst: false } : this.centerStep(1, C.F2_CENTER_MIN, C.F2_CENTER_MAX);
    } else if (which === 'physical') {
      s = { kind: 'PHYSICAL', ticks: 600, count: 0, pool: 0, special: null, burst: false };
    } else {
      s = this.flightStep(C.F2_FLIGHT_MIN, C.F2_FLIGHT_MAX);
    }
    this.queue.unshift(s);
  }

  describe(): string {
    return `fase=${this.activePhaseV} (alcanzada ${this.reachedPhaseV}, transición ${this.pendingTransitionV}) estado=${this.stateV} paso=${this.step?.kind ?? '-'} t=${this.elapsed}/${this.stepTicks} habilidad=${this.abilityIdV ?? '-'} cola=${this.queue.length} físico=${this.physical.describe()} vida=${Math.floor(this.health())} mov=${this.move}`;
  }

  // ------------------------------------------------------------------------------------------------------
  // Guardado (propiedades dinámicas del dragón)

  private load(): void {
    this.loaded = true;
    const d = this.dragon;
    const num = (k: string, def: number) => {
      const v = d.getDynamicProperty(`improvedragon:${k}`);
      return typeof v === 'number' ? v : def;
    };
    const fixed = d.getDynamicProperty('improvedragon:health_fixed') === true;
    if (!fixed) {
      try {
        const h = d.getComponent('minecraft:health');
        if (h) h.setCurrentValue(h.effectiveMax);
      } catch {
        /* ignorar */
      }
      d.setDynamicProperty('improvedragon:health_fixed', true);
    }
    this.reachedPhaseV = clamp(num('reached', 1), 1, 4);
    this.activePhaseV = clamp(num('active', 1), 1, 4);
    this.pendingTransitionV = num('pending', 0);
    this.pearlActive = num('pearl_active', 0);
    this.pearlCooldown = num('pearl_cooldown', 0);
    this.deathHandledV = d.getDynamicProperty('improvedragon:death') === true;
    if (this.activePhaseV >= 2 || this.pendingTransitionV !== 0 || this.deathHandledV) {
      this.scripted = false;
      this.goScripted();
    } else {
      try {
        d.triggerEvent('improvedragon:vanilla');
      } catch {
        /* ignorar */
      }
    }
    if (this.deathHandledV) {
      // Se recargó en mitad del Último Aliento: se reinicia.
      this.deathHandledV = false;
      this.beginDeath();
    }
  }

  save(): void {
    try {
      const d = this.dragon;
      if (!d.isValid) return;
      d.setDynamicProperty('improvedragon:reached', this.reachedPhaseV);
      d.setDynamicProperty('improvedragon:active', this.activePhaseV);
      d.setDynamicProperty('improvedragon:pending', this.pendingTransitionV);
      d.setDynamicProperty('improvedragon:pearl_active', this.pearlActive);
      d.setDynamicProperty('improvedragon:pearl_cooldown', this.pearlCooldown);
      d.setDynamicProperty('improvedragon:death', this.deathHandledV);
    } catch {
      /* ignorar */
    }
  }
}

/** Gancho del Último Aliento (lo registra world/lastBreath.ts, así no hay dependencia circular). */
export const DEATH_HOOK: { begin?: (b: Brain) => void } = {};
export const DEBUG = { on: false };

// ---------------------------------------------------------------------------------------------------------
// Utilidades de efectos (DragonFx, ParticleWave)

function boost(victim: Entity): void {
  try {
    const vel = victim.getVelocity();
    if (victim instanceof Player) victim.applyKnockback({ x: vel.x * 0.2, z: vel.z * 0.2 }, 3.9);
    else {
      victim.clearVelocity();
      victim.applyImpulse({ x: vel.x * 0.2, y: 3.9, z: vel.z * 0.2 });
    }
  } catch {
    /* ignorar */
  }
}

function onGround(e: Entity): boolean {
  try {
    return e.isOnGround;
  } catch {
    return true;
  }
}

/** Boca para los agarres: un poco por debajo de la cabeza (PhysicalAttack.mouth). */
export function grabMouth(b: Brain): V {
  return b.head().add(b.forward().scale(1.2)).add(0, -1.8, 0);
}

export function headAura(head: V): void {
  dust(head, COLORS.red, 4, new V(1.2, 0.8, 1.2));
  if (Math.random() < 0.5) particle(PART.lava, head, 1, 1);
}

export function teleportBurst(p: V): void {
  particle(PART.portal, p.add(0, 2, 0), 12, 3);
  dust(p.add(0, 2, 0), COLORS.purple, 60, new V(3, 2, 3), 0.3);
}

export function contractingRing(center: V, radius: number, count: number, vertical: boolean, color: RGB): void {
  const phase = Math.random() * Math.PI * 2;
  const tilt = Math.random() * Math.PI;
  for (let i = 0; i < count; i++) {
    const a = phase + (i * Math.PI * 2) / count;
    const off = vertical
      ? new V(Math.cos(a) * Math.cos(tilt) * radius, Math.sin(a) * radius, Math.cos(a) * Math.sin(tilt) * radius)
      : new V(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    spark(center.add(off), off.scale(-0.025), color);
  }
}

export function groundRing(center: V, radius: number, count: number, color: RGB): void {
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    dust(new V(center.x + Math.cos(a) * radius, center.y + 0.2, center.z + Math.sin(a) * radius), color);
  }
}

export function groundDust(center: V, radius: number, count: number): void {
  for (let i = 0; i < count; i += 4) {
    const a = Math.random() * Math.PI * 2;
    const r = radius * (0.6 + Math.random() * 0.4);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const g = groundAt(x, z);
    if (g !== null) particle(PART.smoke, new V(x, g + 0.5, z));
  }
}

export function bigCircle(center: V, radius: number, color: RGB): void {
  const count = Math.floor(radius * 3);
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    dust(new V(center.x + Math.cos(a) * radius, center.y + 1, center.z + Math.sin(a) * radius), color, 1, new V(0, 0.3, 0));
  }
}

export function boomLine(from: V, to: V, spacing: number, id: string = PART.explosion, alt?: string): void {
  const delta = to.sub(from);
  const length = delta.length();
  if (length < 0.1) return;
  const dir = delta.scale(1 / length);
  const n = Math.ceil(length / spacing);
  for (let i = 0; i <= n; i++) {
    const p = from.add(dir.scale(Math.min(length, i * spacing)));
    particle(alt && i % 2 === 1 ? alt : id, p);
  }
}

/** Línea de partículas entre dos puntos (haz de curación de cristales). */
export function beam(from: V, to: V, color: RGB, spacing = 1.5): void {
  const d = to.sub(from);
  const len = d.length();
  const n = Math.min(60, Math.ceil(len / spacing));
  for (let i = 0; i <= n; i++) dust(from.lerp(to, i / Math.max(1, n)), color, 1, V.ZERO, 0, 1.2);
}

/** Onda de partículas que se expande por el suelo (ParticleWave). */
export class ParticleWave {
  private age = 0;
  constructor(
    private readonly center: V,
    private readonly radius: number,
    private readonly ticks: number,
    private readonly color: RGB,
  ) {
    this.ticks = Math.max(1, ticks);
  }
  tick(): boolean {
    this.age++;
    if (this.age > this.ticks) return true;
    const r = this.radius * (this.age / this.ticks);
    const count = Math.floor(Math.min(48, Math.max(12, r * 0.8)));
    const phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = phase + (i * Math.PI * 2) / count;
      const x = this.center.x + Math.cos(a) * r;
      const z = this.center.z + Math.sin(a) * r;
      const g = groundAt(x, z);
      const y = g === null ? this.center.y : Math.max(g, this.center.y - 12) + 0.5;
      dust(new V(x, y + 0.6, z), this.color, 2, new V(0, 0.6, 0), 0.05);
      if (i % 4 === 0) particle(PART.endRod, new V(x, y + 0.8, z));
    }
    return false;
  }
}

export { push };
export function worldPlayers(): Player[] {
  return world.getAllPlayers();
}
