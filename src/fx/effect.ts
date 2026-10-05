import { Entity, EntityDamageCause, system, world, type Vector3 } from '@minecraft/server';
import { MODELS, type ModelInfo } from '../generated/models';
import { end, NS, now, SESSION, sound } from '../core/world';
import { DEG, V } from '../util/vec';

/** Modos de seguimiento de EffectEntity. */
export const TIE = 0;
export const POSITION = 1;
export const HEAD = 2;

/** Quién calcula la posición de la cabeza del dragón (lo registra el cerebro). */
let headResolver: (e: Entity) => V | null = () => null;
export function setHeadResolver(fn: (e: Entity) => V | null): void {
  headResolver = fn;
}

interface Slot {
  chain: number[];
  index: number;
  left: number;
  restart: boolean;
}

const ALL = new Set<Effect>();
const BY_ID = new Map<string, Effect>();

/**
 * Efecto con modelo (EffectEntity de Java): una entidad improvedragon:<modelo> sin IA. Tres ranuras de
 * animación con cadenas "a>b" (a una vez, luego b), escala, orientación (yaw/pitch), largo para los haces
 * y seguimiento de otra entidad.
 */
export class Effect {
  readonly entity: Entity;
  readonly model: string;
  readonly info: ModelInfo;
  protected lifeTicks: number;
  protected ageTicks = 0;
  private slots: Slot[] = [];
  private followTarget: Entity | null = null;
  private followMode = TIE;
  private followOffset = 0;
  private aimYawDeg = 0;
  private aimPitchDeg = 0;
  private scaleV = 1;
  private scaleYV = -1;
  private scaleZV = -1;
  private lengthV = 0;
  private dyV = 0;
  private dirtyRot = true;
  private dirtyScale = true;
  private lastPos: V;
  private removed = false;

  constructor(model: string, at: Vector3, anims: string, scale: number, life: number) {
    const info = MODELS[model];
    if (!info) throw new Error(`modelo desconocido: ${model}`);
    this.model = model;
    this.info = info;
    this.entity = end().spawnEntity(`${NS}:${model}`, at);
    this.entity.setDynamicProperty('sid', SESSION);
    this.lastPos = V.of(at);
    this.scaleV = scale;
    this.lifeTicks = life;
    for (let i = 0; i < 3; i++) this.slots.push({ chain: [], index: 0, left: 0, restart: false });
    this.anims(anims);
    this.apply();
    ALL.add(this);
    BY_ID.set(this.entity.id, this);
  }

  static spawn(model: string, at: Vector3, anims = '', scale = 1, life = 0): Effect {
    return new Effect(model, at, anims, scale, life);
  }

  // ---- propiedades

  get age(): number {
    return this.ageTicks;
  }
  infinite(): boolean {
    return this.lifeTicks <= 0;
  }
  life(ticks: number): this {
    this.lifeTicks = ticks;
    this.ageTicks = 0;
    return this;
  }
  get valid(): boolean {
    if (this.removed) return false;
    try {
      return this.entity.isValid;
    } catch {
      return false;
    }
  }
  /** Igual que isRemoved() de Java. */
  isRemoved(): boolean {
    return !this.valid;
  }
  position(): V {
    return this.lastPos;
  }
  scale(s: number): this {
    this.scaleV = s;
    this.dirtyScale = true;
    return this;
  }
  scaleY(sy: number): this {
    this.scaleYV = sy;
    this.dirtyScale = true;
    return this;
  }
  /** Escala propia en Z (grosor); por defecto la general. */
  scaleZ(sz: number): this {
    this.scaleZV = sz;
    this.dirtyScale = true;
    return this;
  }
  getScale(): number {
    return this.scaleV;
  }
  length(): number {
    return this.lengthV;
  }
  renderDy(dy: number): this {
    this.dyV = dy;
    this.dirtyScale = true;
    return this;
  }
  getRenderDy(): number {
    return this.dyV;
  }
  yaw(deg: number): this {
    this.aimYawDeg = deg;
    this.dirtyRot = true;
    return this;
  }
  getYaw(): number {
    return this.aimYawDeg;
  }
  /** Orienta el eje +Z del modelo hacia `dir` (EffectEntity.faceDir). */
  faceDir(dir: Vector3): this {
    const d = V.of(dir);
    this.aimYawDeg = Math.atan2(d.x, d.z) * DEG;
    this.aimPitchDeg = Math.atan2(d.y, d.horizontalDistance()) * DEG;
    this.dirtyRot = true;
    return this;
  }
  /** Apunta hacia `to` y estira el modelo hasta allí (los haces miden 32 bloques). */
  aimAt(to: Vector3): this {
    const d = V.of(to).sub(this.lastPos);
    this.faceDir(d);
    this.lengthV = d.length();
    this.dirtyScale = true;
    return this;
  }
  follow(target: Entity, mode: number, offsetY = 0): this {
    this.followTarget = target;
    this.followMode = mode;
    this.followOffset = offsetY;
    const at = this.followPos();
    if (at) this.moveTo(at);
    return this;
  }
  followed(): Entity | null {
    return this.followTarget;
  }
  /** En Java oculta al seguido; en Bedrock no se puede ocultar a un jugador concreto. */
  hideFollowed(): this {
    return this;
  }

  /** Cambia las tres ranuras de animación: "cadena0|cadena1|cadena2" (cadena = "a>b>c"). */
  anims(spec: string): this {
    const parts = spec.split('|');
    for (let i = 0; i < 3; i++) this.setSlot(i, parts[i] ?? '');
    return this;
  }
  slot(index: number, chain: string | null): this {
    this.setSlot(index, chain ?? '');
    return this;
  }
  private setSlot(index: number, chain: string): void {
    const ids = chain
      .split('>')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => this.info.anims.indexOf(s))
      .filter((i) => i >= 0);
    const s = this.slots[index];
    const prevFirst = s.chain[s.index];
    s.chain = ids;
    s.index = 0;
    s.left = ids.length > 1 ? Math.max(1, this.info.lengths[ids[0]]) : 0;
    s.restart = ids.length > 0 && ids[0] === prevFirst;
    this.pushSlot(index);
  }
  private pushSlot(index: number): void {
    const s = this.slots[index];
    const value = s.chain.length === 0 ? -1 : s.chain[s.index];
    try {
      if (s.restart) {
        this.entity.setProperty(`${NS}:a${index}`, -1);
        system.runTimeout(() => {
          if (this.valid && s.chain[s.index] === value) this.entity.setProperty(`${NS}:a${index}`, value);
        }, 1);
        s.restart = false;
      } else {
        this.entity.setProperty(`${NS}:a${index}`, value);
      }
    } catch {
      /* entidad descargada */
    }
  }

  moveTo(at: Vector3): this {
    this.lastPos = V.of(at);
    try {
      this.entity.teleport(at, { rotation: { x: 0, y: this.bedrockYaw() } });
    } catch {
      /* fuera de carga */
    }
    this.dirtyRot = false;
    return this;
  }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    ALL.delete(this);
    BY_ID.delete(this.entity.id);
    try {
      if (this.entity.isValid) this.entity.remove();
    } catch {
      /* ya no existe */
    }
  }
  /** discard() de Java. */
  discard(): void {
    this.remove();
  }

  // ---- interno

  private bedrockYaw(): number {
    // Java gira el modelo con YP(aimYaw); en Bedrock la entidad con yaw θ equivale a girarlo -(θ) y además
    // invierte Z, así que θ = -(aimYaw + 180).
    let y = -(this.aimYawDeg + 180);
    y = ((((y + 180) % 360) + 360) % 360) - 180;
    return y;
  }

  private followPos(): V | null {
    const t = this.followTarget;
    if (!t) return null;
    try {
      if (!t.isValid) return null;
      if (this.followMode === HEAD) {
        const h = headResolver(t);
        if (h) return h.add(0, this.followOffset, 0);
      }
      if (this.followMode === POSITION || this.followMode === HEAD) return V.of(t.location).add(0, this.followOffset, 0);
    } catch {
      return null;
    }
    return null;
  }

  private apply(): void {
    try {
      if (this.dirtyScale) {
        const sx = this.scaleV;
        const sy = this.lengthV > 0 ? this.scaleV : this.scaleYV > 0 ? this.scaleYV : this.scaleV;
        const sz = this.lengthV > 0 ? this.lengthV / 32 : this.scaleZV > 0 ? this.scaleZV : this.scaleV;
        this.entity.setProperty(`${NS}:sx`, Math.min(2000, sx));
        this.entity.setProperty(`${NS}:sy`, Math.min(2000, sy));
        this.entity.setProperty(`${NS}:sz`, Math.min(2000, sz));
        this.entity.setProperty(`${NS}:dy`, Math.max(-500, Math.min(500, this.dyV)));
        this.dirtyScale = false;
      }
      if (this.dirtyRot) {
        this.entity.setProperty(`${NS}:pitch`, Math.max(-180, Math.min(180, this.aimPitchDeg)));
        this.entity.setRotation({ x: 0, y: this.bedrockYaw() });
        this.dirtyRot = false;
      }
    } catch {
      /* descargada */
    }
  }

  /** Devuelve true si el efecto terminó. */
  tick(): boolean {
    if (!this.valid) return true;
    this.ageTicks++;
    if (this.lifeTicks > 0 && this.ageTicks >= this.lifeTicks) {
      this.remove();
      return true;
    }
    if (this.followTarget) {
      let gone = false;
      try {
        gone = !this.followTarget.isValid;
      } catch {
        gone = true;
      }
      if (gone) {
        this.remove();
        return true;
      }
      const at = this.followPos();
      if (at && at.distanceToSqr(this.lastPos) > 1e-4) this.moveTo(at);
    }
    for (let i = 0; i < 3; i++) {
      const s = this.slots[i];
      if (s.chain.length > 1 && s.index < s.chain.length - 1 && --s.left <= 0) {
        s.index++;
        s.left = Math.max(1, this.info.lengths[s.chain[s.index]]);
        this.pushSlot(i);
      }
    }
    this.apply();
    return false;
  }

  /** Lo llama el evento de daño; las golpeables lo sobrescriben. */
  onHurt(_attacker: Entity | undefined, _projectile: boolean, _explosion: boolean): void {}
}

/** Filtros de golpe de TargetEntity. */
export const ANY = 0;
export const ARROWS = 1;
export const MELEE = 2;

/** Efecto que se puede golpear (TargetEntity): cuenta golpes de jugadores con 5 ticks de separación. */
export class Target extends Effect {
  private filter: number;
  private hitCount = 0;
  private lastHitAge = -1000;
  private invulnerable = false;

  constructor(model: string, at: Vector3, anims: string, scale: number, life: number, filter: number) {
    super(model, at, anims, scale, life);
    this.filter = filter;
  }

  static spawnTarget(model: string, at: Vector3, anims: string, scale: number, life: number, filter = ANY): Target {
    return new Target(model, at, anims, scale, life, filter);
  }
  /** spawnCentered de Java: `center` es el centro de la caja. */
  static spawnCentered(model: string, center: Vector3, anims: string, scale: number, life: number, filter = ANY): Target {
    const h = MODELS[model]?.target?.[1] ?? 1;
    const t = new Target(model, V.of(center).sub(0, h * 0.5, 0), anims, scale, life, filter);
    t.renderDy(h * 0.5);
    return t;
  }

  hits(): number {
    return this.hitCount;
  }
  sinceHit(): number {
    return this.age - this.lastHitAge;
  }
  setInvulnerableNow(inv: boolean): void {
    this.invulnerable = inv;
  }
  center(): V {
    return this.position().add(0, this.getRenderDy(), 0);
  }
  moveCenter(c: Vector3): void {
    this.moveTo(V.of(c).sub(0, this.getRenderDy(), 0));
  }

  override onHurt(attacker: Entity | undefined, projectile: boolean, explosion: boolean): void {
    if (this.invulnerable || explosion) return;
    if (!attacker || attacker.typeId !== 'minecraft:player') return;
    if ((this.filter === ARROWS && !projectile) || (this.filter === MELEE && projectile)) return;
    if (this.age - this.lastHitAge < 5) return;
    this.hitCount++;
    this.lastHitAge = this.age;
    const at = this.position();
    system.run(() => sound(at, 'hit.amethyst_block', 3, 0.6));
  }
}

/** Avanza todos los efectos (una vez por tick). */
export function tickEffects(): void {
  for (const fx of [...ALL]) fx.tick();
}

export function effectOf(e: Entity): Effect | undefined {
  return BY_ID.get(e.id);
}

export function allEffects(): Iterable<Effect> {
  return ALL;
}

/** Los efectos se cancelan en el evento de daño; las golpeables cuentan el golpe. */
export function registerEffectEvents(): void {
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const e = ev.hurtEntity;
    if (!e.typeId.startsWith(`${NS}:`) || e.typeId === `${NS}:rift_enderman`) return;
    ev.cancel = true;
    const fx = BY_ID.get(e.id);
    if (!fx) return;
    const src = ev.damageSource;
    const cause = src.cause;
    const explosion = cause === EntityDamageCause.blockExplosion || cause === EntityDamageCause.entityExplosion;
    const projectile = cause === EntityDamageCause.projectile || src.damagingProjectile !== undefined;
    fx.onHurt(src.damagingEntity, projectile, explosion);
  });
  // Efectos huérfanos de una sesión anterior (recarga del mundo o de scripts).
  world.afterEvents.entityLoad.subscribe(({ entity }) => cleanStale(entity));
  system.runTimeout(() => {
    try {
      for (const e of end().getEntities({ families: [`${NS}_fx`] })) cleanStale(e);
    } catch {
      /* el End no está cargado */
    }
  }, 1);
}

function cleanStale(e: Entity): void {
  try {
    if (!e.isValid || !e.typeId.startsWith(`${NS}:`)) return;
    if (e.typeId === `${NS}:rift_enderman`) return;
    if (BY_ID.has(e.id)) return;
    if (e.getDynamicProperty('sid') !== SESSION) {
      if (e.typeId === `${NS}:grab_seat`) {
        const r = e.getComponent('minecraft:rideable');
        for (const rider of r?.getRiders() ?? []) r?.ejectRider(rider);
      }
      e.remove();
    }
  } catch {
    /* ignorar */
  }
}

export function ticksNow(): number {
  return now();
}
