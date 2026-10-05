import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, blocking, isPassenger, SND, targetVel, throwVictim } from '../util';

enum Step {
  APPROACH,
  HOLD,
  CARRY,
  DIVE,
}

/** Agarre / Ascenso del Depredador: atrapa con la boca, se lo lleva, lo muerde y lo estampa (GrabAttack). */
export class GrabAttack extends PhysicalAttack {
  private step = Step.APPROACH;
  private stepTicks = 0;
  private circle = 0;

  constructor(readonly wrath: boolean) {
    super();
  }

  name(): string {
    return this.wrath ? 'predator_ascent' : 'grab';
  }
  cooldown(): number {
    return this.wrath ? 300 : 400;
  }
  score(brain: Brain, target: Entity): number {
    if (!isPassenger(target) && brain.physical.groupSize(target, 10) <= 1) {
      if (aboveGround(brain, target) > 4) return 0;
      return blocking(brain, target) ? 2.3 : 1.3;
    }
    return this.wrath ? 0.3 : 0;
  }

  private go(s: Step): void {
    this.step = s;
    this.stepTicks = 0;
  }

  private escapeTicks(): number {
    return this.wrath ? C.ASCENT_ESCAPE : C.GRAB_ESCAPE_TICKS;
  }

  private letGo(brain: Brain): boolean {
    brain.log(`${this.name()}: ${Brain.valid(this.target) ? this.target.typeId : '?'} se ha soltado`);
    this.release();
    return true;
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.stepTicks++;
    switch (this.step) {
      case Step.APPROACH: {
        if (!Brain.valid(this.target) || this.stepTicks > 220) {
          brain.log(`${this.name()}: no lo alcanza`);
          return true;
        }
        const pos = V.of(this.target.location);
        const vel = targetVel(this.target);
        brain.fly(pos.add(vel.scale(8)), this.wrath ? C.PASS_SPEED : C.CHASE_SPEED, 1.2);
        const reach = this.wrath ? 4.5 : 4.0;
        if (!isPassenger(this.target) && brain.head().distanceTo(Brain.mid(this.target)) <= reach) {
          this.grab(brain);
          this.go(this.wrath ? Step.CARRY : Step.HOLD);
        }
        break;
      }
      case Step.HOLD:
        if (!this.holding()) return this.letGo(brain);
        brain.fly(brain.position().add(brain.forward().scale(10)), C.CRUISE_SPEED, 2.5);
        this.moveSeat(brain);
        if (this.stepTicks >= this.escapeTicks()) {
          this.seat!.locked = true;
          brain.sound(brain.head(), SND.growl, 6, 0.8);
          this.go(Step.CARRY);
        }
        break;
      case Step.CARRY: {
        if (!this.holding()) return this.letGo(brain);
        if (this.wrath && !this.seat!.locked && this.stepTicks >= this.escapeTicks()) this.seat!.locked = true;
        if (this.wrath) {
          brain.place(brain.position().add(0, C.ASCENT_RISE_SPEED, 0), brain.yaw());
        } else {
          this.circle += 0.05;
          const f = brain.forward();
          const side = new V(-f.z, 0, f.x);
          const to = brain.position().add(f.scale(10)).add(side.scale(4 * Math.sin(this.circle)));
          brain.fly(to, C.CRUISE_SPEED, C.GRAB_LIFT);
        }
        this.moveSeat(brain);
        const period = this.wrath ? C.ASCENT_BITE_PERIOD : C.GRAB_BITE_PERIOD;
        if (this.stepTicks % period === 0) {
          const m = PhysicalAttack.mouth(brain);
          brain.sound(m, SND.bite, 4, 0.7);
          PhysicalAttack.whiteBurst(brain, m.add(0, 1, 0), 6, 0.4);
          brain.strike(this.target, DT.GRAB_BITE, this.wrath ? C.ASCENT_BITE_DAMAGE : C.GRAB_BITE_DAMAGE, V.ZERO, 0, 0);
        }
        const carry = this.wrath ? C.ASCENT_RISE_TICKS : C.GRAB_CARRY_TICKS;
        if (this.stepTicks >= carry) {
          brain.sound(brain.head(), SND.growl, 8, 0.5);
          if (this.wrath) {
            this.throwDown(brain);
            brain.launch(0.2);
            return true;
          }
          this.go(Step.DIVE);
        }
        break;
      }
      case Step.DIVE: {
        if (!this.holding()) {
          this.release();
          return true;
        }
        brain.fly(brain.position().add(brain.forward().scale(20)), C.PASS_SPEED, 3);
        this.moveSeat(brain);
        const p = brain.position();
        const above = p.y - brain.groundY(p.x, p.z);
        if (above < 11 || this.stepTicks > 60) {
          this.throwDown(brain);
          return true;
        }
        break;
      }
    }
    return false;
  }

  private throwDown(brain: Brain): void {
    const victim = this.target;
    const f = brain.forward();
    this.release();
    if (this.wrath) {
      throwVictim(victim, 0, -2.5, 0);
      brain.addThrown(victim, C.ASCENT_SLAM_DAMAGE, C.ASCENT_WAVE_DAMAGE, C.ASCENT_WAVE_RADIUS, true);
    } else {
      throwVictim(victim, f.x * 0.6, -1.8, f.z * 0.6);
      brain.addThrown(victim, C.GRAB_SLAM_DAMAGE, C.GRAB_WAVE_DAMAGE, C.GRAB_WAVE_RADIUS, false);
    }
    brain.sound(brain.head(), SND.knockback, 6, 0.5);
    brain.log(`${this.name()}: lanza a ${victim.typeId}`);
  }
}
