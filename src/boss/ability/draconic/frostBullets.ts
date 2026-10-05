import { Entity, Player } from '@minecraft/server';
import { C } from '../../../config';
import { DT, strike } from '../../../core/damage';
import { alive, blockHit, end, height, particle, PART, sound } from '../../../core/world';
import { Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import { IcePrison } from '../../../world/icePrison';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';
import { firstEntityOnMove } from './flightUtil';

/** Balas de escarcha (FrostBulletsAbility): una bala teledirigida cada FROST_INTERVAL ticks a un objetivo al azar. */
export class FrostBulletsAbility implements Ability {
  private t = 0;
  private fired = 0;

  start(brain: Brain): void {
    brain.sound(brain.head(), 'mob.enderdragon.growl', 5, 1.3);
  }

  tick(brain: Brain): boolean {
    if (this.t++ % C.FROST_INTERVAL !== 0) return false;
    const target = brain.randomTarget(brain.position(), C.FROST_RANGE);
    if (target !== null && this.fired < C.FROST_BULLETS) {
      const from = brain.head();
      brain.addTask(new FrostBullet(brain, target, from));
      brain.sound(from, 'mob.shulker.shoot', 4, 0.6);
      this.fired++;
      return false;
    }
    return true;
  }
}

const SPEED = 0.55;
const LIFE = 200;

/** Modelo de la bala: si un jugador la golpea, revienta (FrostBulletEntity.hurt). */
class BulletFx extends Effect {
  popped = false;

  override onHurt(attacker: Entity | undefined, _projectile: boolean, _explosion: boolean): void {
    if (!attacker || attacker.typeId === 'minecraft:ender_dragon') return;
    this.popped = true;
  }
}

/**
 * Bala de escarcha (FrostBulletEntity): un Effect 'frost_bullet' que el script mueve. Sale con una desviación
 * aleatoria y gira hacia los ojos del objetivo (85 % de su velocidad + 15 % hacia él). Al tocar una entidad la
 * congela (daño FROST firmado desde la bala y, si es un jugador, prisión de hielo); al tocar un bloque, explota.
 */
class FrostBullet implements Task {
  private readonly fx: BulletFx;
  private pos: V;
  private vel: V;
  private age = 0;

  constructor(brain: Brain, private readonly target: Entity, from: V) {
    this.pos = from;
    const dir = eyes(target)
      .sub(from)
      .add((rand.nextDouble() - 0.5) * 8, (rand.nextDouble() - 0.5) * 4, (rand.nextDouble() - 0.5) * 8)
      .normalize();
    this.vel = dir.scale(SPEED);
    this.fx = new BulletFx('frost_bullet', from, 'spin', 1, 0);
    this.fx.faceDir(this.vel.scale(-1));
    brain.adopt(this.fx);
  }

  tick(brain: Brain): boolean {
    if (!this.fx.valid) return true;
    if (this.fx.popped) {
      sound(this.pos, 'random.glass', 1.5, 1.2);
      particle(PART.snowflake, this.pos, 6, 0.3);
      return this.discard();
    }
    this.age++;
    if (this.age > LIFE) return this.discard();
    if (alive(this.target)) {
      const want = eyes(this.target).sub(this.pos).normalize().scale(SPEED);
      this.vel = this.vel.scale(0.85).add(want.scale(0.15));
    }
    const next = this.pos.add(this.vel);
    // Choque en el recorrido de este tick: primero el bloque, luego la entidad más cercana antes que él.
    const block = blockHit(this.pos, next);
    const victim = firstEntityOnMove(this.pos, block ?? next, 0.4);
    if (victim) {
      this.hitEntity(brain, victim);
      return this.discard();
    }
    if (block) {
      this.hitBlock(brain, block);
      return this.discard();
    }
    this.pos = next;
    this.fx.faceDir(this.vel.scale(-1));
    this.fx.moveTo(next);
    if (this.age % 2 === 0) particle(PART.snowflake, next.add(0, 0.2, 0));
    if (rand.nextInt(6) === 0) particle(PART.endRod, next.add(0, 0.2, 0));
    return false;
  }

  private hitEntity(brain: Brain, victim: Entity): void {
    const damaged = strike(victim, DT.FROST, C.FROST_DAMAGE, brain.dragon, V.ZERO, 0, 0, this.pos);
    if (damaged) {
      // setTicksFrozen no existe en Bedrock: lentitud fuerte mientras duraría la congelación + copos.
      try {
        victim.addEffect('slowness', C.FROST_FREEZE_TICKS * 2, { amplifier: 2 });
      } catch {
        /* ignorar */
      }
      particle(PART.snowflake, V.of(victim.location).add(0, 1, 0), 8, 0.5);
      if (victim instanceof Player) brain.addPrison(IcePrison.place(victim, C.FROST_PRISON_TICKS));
    }
    sound(this.pos, 'random.glass', 3, 0.8);
  }

  private hitBlock(brain: Brain, at: V): void {
    try {
      end().createExplosion(at, 1, { breaksBlocks: false, causesFire: false, source: brain.dragon });
    } catch {
      /* fuera de carga */
    }
    sound(at, 'random.glass', 2, 0.7);
  }

  private discard(): boolean {
    this.fx.discard();
    return true;
  }

  cancel(_brain: Brain): void {
    this.fx.discard();
  }
}

/** getEyePosition() de Java. */
function eyes(e: Entity): V {
  try {
    return V.of(e.getHeadLocation());
  } catch {
    return V.of(e.location).add(0, height(e) * 0.85, 0);
  }
}
