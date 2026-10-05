import { Entity, Player } from '@minecraft/server';
import { C } from '../../../config';
import { alive, end, particle, PART, sound, validPlayer } from '../../../core/world';
import { ANY, Target } from '../../../fx/effect';
import { V } from '../../../util/vec';

/** Etiqueta de las invocaciones sin botín ni experiencia (FearTask.SUMMON_TAG). */
export const SUMMON_TAG = 'improvedragon_summon';

/**
 * Vida "casi infinita" para efectos permanentes adoptados: con vida 0 el cerebro los trata como huérfanos
 * y los quita en cuanto no hay habilidad ni tarea (en Java los cristales siguen vivos hasta que se rompen).
 */
export const CENTER_PERMANENT = 1_000_000_000;

/** Estilos de ConstellationCrystalEntity. */
export const NORMAL = 0;
export const FEAR = 1;
export const CORE = 2;

/**
 * Cristal de la Constelación (ConstellationCrystalEntity, un EndCrystal de Java): un golpe directo lo hace
 * estallar al momento; una explosión enciende una mecha de CONSTELLATION_FUSE ticks (reacción en cadena).
 * El evento de daño es de solo lectura, así que el golpe solo marca la mecha y el tick detona.
 */
export class CenterCrystal extends Target {
  readonly style: number;
  private fuse = -1;

  constructor(at: V, style: number) {
    const model = style === FEAR ? 'fear_crystal' : style === CORE ? 'fear_core' : 'constellation_crystal';
    super(model, at, style === NORMAL ? 'orbit' : 'spawn>loop', 1, CENTER_PERMANENT, ANY);
    this.style = style;
  }

  override onHurt(attacker: Entity | undefined, _projectile: boolean, explosion: boolean): void {
    if (!this.valid) return;
    try {
      if (attacker && attacker.typeId === 'minecraft:ender_dragon') return;
    } catch {
      /* atacante descargado */
    }
    if (explosion) {
      if (this.fuse < 0) this.fuse = C.CONSTELLATION_FUSE;
      return;
    }
    // Golpe directo: detona en el siguiente tick (Java lo hace en el mismo).
    this.fuse = 0;
  }

  override tick(): boolean {
    if (super.tick()) return true;
    if (this.fuse >= 0 && --this.fuse < 0) {
      this.detonate();
      return true;
    }
    return false;
  }

  detonate(): void {
    if (!this.valid) return;
    const at = this.position();
    this.remove();
    try {
      end().createExplosion(at, C.CONSTELLATION_POWER, { breaksBlocks: true, causesFire: false });
    } catch {
      sound(at, 'random.explode', 8, 0.8);
      particle(PART.explosionEmitter, at);
    }
  }
}

/**
 * Suma velocidad horizontal sin anular la vertical (setDeltaMovement(getDeltaMovement().add(dir))):
 * a los jugadores se les aplica con knockback conservando su velocidad actual.
 */
export function centerPull(e: Entity, dx: number, dz: number): void {
  try {
    if (e instanceof Player) {
      const v = e.getVelocity();
      e.applyKnockback({ x: v.x + dx, z: v.z + dz }, v.y);
    } else {
      e.applyImpulse({ x: dx, y: 0, z: dz });
    }
  } catch {
    /* ignorar */
  }
}

/** DragonTargets.all: jugadores válidos a menos de `range`. */
export function centerPlayers(center: V, range: number): Player[] {
  const out: Player[] = [];
  try {
    for (const p of end().getPlayers({ location: center, maxDistance: range })) if (validPlayer(p)) out.push(p);
  } catch {
    /* ignorar */
  }
  return out;
}

/** Quita efectos sin fallar si la entidad ya no está. */
export function centerRemoveEffect(e: Entity, id: string): void {
  try {
    if (alive(e)) e.removeEffect(id);
  } catch {
    /* ignorar */
  }
}
