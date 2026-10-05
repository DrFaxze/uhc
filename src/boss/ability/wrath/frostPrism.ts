import { Entity, Player } from '@minecraft/server';
import { C } from '../../../config';
import { DT, setVelocity } from '../../../core/damage';
import { alive, particle, PART } from '../../../core/world';
import { Target, type Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';

/**
 * Prisma gélido (FrostPrismAbility): el dragón lanza PRISM_COUNT prismas teledirigidos que se pueden romper
 * de un golpe. El que acierta congela al objetivo en un bloque de hielo; si ya estaba congelado, alarga el
 * hielo y le hace daño extra.
 */
export class FrostPrismAbility implements Ability {
  private t = 0;
  private fired = 0;
  private readonly volley = new Volley();

  start(brain: Brain): void {
    brain.addTask(this.volley);
    brain.sound(brain.head(), 'mob.enderdragon.growl', 5, 1.5);
  }

  tick(brain: Brain): boolean {
    if (this.t++ % C.PRISM_INTERVAL !== 0) return false;
    const target = brain.randomTarget(brain.position(), C.FROST_RANGE);
    if (target === null || this.fired >= C.PRISM_COUNT) return true;
    const from = brain.head();
    const prism = Target.spawnCentered('frost_prism', from, 'spawn>fly', 1, 0);
    brain.adopt(prism);
    const v = Brain.mid(target).sub(from).normalize().add(0, 0.3, 0).normalize().scale(C.PRISM_SPEED);
    this.volley.prisms.push(new Prism(prism, target, v));
    brain.sound(from, 'random.glass', 6, 0.5);
    this.fired++;
    return false;
  }
}

class Frozen {
  readonly at: V;
  t = 0;
  constructor(
    readonly victim: Entity,
    readonly ice: Effect,
  ) {
    this.at = V.of(victim.location);
  }
}

class Prism {
  age = 0;
  done = false;
  constructor(
    readonly entity: Target,
    readonly target: Entity,
    public vel: V,
  ) {}
}

class Volley implements Task {
  readonly prisms: Prism[] = [];
  private frozen: Frozen[] = [];
  private t = 0;

  tick(brain: Brain): boolean {
    this.t++;
    for (const p of this.prisms) {
      if (p.done) continue;
      p.age++;
      if (p.entity.hits() > 0) {
        p.entity.anims('shatter').life(10);
        p.entity.setInvulnerableNow(true);
        brain.sound(p.entity.position(), 'random.glass', 5, 1.2);
        p.done = true;
      } else if (p.age <= 200 && !p.entity.isRemoved()) {
        if (Brain.valid(p.target)) {
          const want = Brain.mid(p.target).sub(p.entity.center()).normalize().scale(C.PRISM_SPEED);
          p.vel = p.vel.scale(0.85).add(want.scale(0.15));
        }
        const next = p.entity.center().add(p.vel);
        p.entity.moveCenter(next);
        p.entity.faceDir(p.vel);
        const victim = brain.targetsNear(next, 1.5)[0] ?? null;
        if (victim) {
          p.done = true;
          p.entity.anims('shatter').life(10);
          p.entity.setInvulnerableNow(true);
          brain.sound(next, 'mob.player.hurt_freeze', 6, 0.6);
          const already = this.frozen.find((f) => f.victim.id === victim.id) ?? null;
          if (already) {
            if (brain.strike(victim, DT.FROST, C.PRISM_REFREEZE_DAMAGE)) {
              already.t -= C.PRISM_REFREEZE_TICKS;
              brain.log(`prisma gelido: ${victim.typeId} sigue congelado (+${C.PRISM_REFREEZE_TICKS} ticks)`);
            }
          } else if (brain.strike(victim, DT.FROST, C.PRISM_DAMAGE)) {
            const ice = brain.fx('ice_prison', victim.location, 'freeze>loop', 1, 0);
            this.frozen.push(new Frozen(victim, ice));
            brain.log(`prisma gelido: congela a ${victim.typeId}`);
          }
        }
      } else {
        p.entity.discard();
        p.done = true;
      }
    }
    this.frozen = this.frozen.filter((f) => !this.tickFrozen(brain, f));
    const flying = this.prisms.some((p) => !p.done);
    return this.t > 40 && !flying && this.frozen.length === 0;
  }

  private tickFrozen(brain: Brain, f: Frozen): boolean {
    f.t++;
    if (alive(f.victim) && f.t <= C.PRISM_FREEZE_TICKS) {
      // setDeltaMovement(0) + teleport al punto de congelación; setTicksFrozen no existe: lentitud y copos.
      try {
        if (f.victim instanceof Player) f.victim.teleport(f.at);
        else {
          f.victim.teleport(f.at);
          setVelocity(f.victim, 0, 0, 0);
        }
        if (f.t % 10 === 1) f.victim.addEffect('slowness', 20, { amplifier: 3, showParticles: false });
      } catch {
        /* ignorar */
      }
      if (f.t % 4 === 0) particle(PART.snowflake, f.at.add(0, 1, 0), 2, 0.6);
      if (f.t % C.PRISM_FREEZE_PERIOD === 0) brain.strike(f.victim, DT.FROST, C.PRISM_FREEZE_DAMAGE);
      return false;
    }
    f.ice.anims('break').life(10);
    brain.sound(f.at, 'random.glass', 5, 0.8);
    return true;
  }

  cancel(_brain: Brain): void {
    for (const f of this.frozen) f.ice.discard();
  }
}
