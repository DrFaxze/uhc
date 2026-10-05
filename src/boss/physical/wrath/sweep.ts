import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { mark, SND, sweepFx } from '../util';

enum Step {
  APPROACH,
  BRAKE,
  SPIN,
}

/** Barrido: frena junto al objetivo y gira sobre sí mismo barriendo todo alrededor (SweepAttack). */
export class SweepAttack extends PhysicalAttack {
  private step = Step.APPROACH;
  private stepTicks = 0;
  private spot = V.ZERO;

  name(): string {
    return 'sweep';
  }
  cooldown(): number {
    return 100;
  }
  score(brain: Brain, target: Entity): number {
    const n = brain.physical.groupSize(target, 8);
    return n >= 2 ? 1.4 + 0.3 * n : 0.8;
  }
  override staysAggressive(): boolean {
    return true;
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.stepTicks++;
    switch (this.step) {
      case Step.APPROACH:
        if (!Brain.valid(this.target)) return true;
        brain.fly(this.target.location, C.PASS_SPEED, 2);
        if (PhysicalAttack.flatDist(brain.position(), this.target.location) < 6 || this.stepTicks > 140) {
          this.beginBrake(brain, 6);
          this.step = Step.BRAKE;
          this.stepTicks = 0;
        }
        break;
      case Step.BRAKE:
        if (this.brakeStep(brain, brain.yaw(), 0)) {
          this.spot = brain.position();
          brain.sound(this.spot, SND.flap, 10, 0.4);
          this.step = Step.SPIN;
          this.stepTicks = 0;
        }
        break;
      case Step.SPIN: {
        brain.place(this.spot, brain.yaw() + 22.5);
        const tail = brain.part(5);
        sweepFx(tail.add(0, 0.5, 0), 2, 1.2, 0.2, 1.2);
        if (this.stepTicks === 8) {
          brain.sound(this.spot, SND.sweep, 10, 0.4);
          const radius = C.SWEEP_RADIUS;
          PhysicalAttack.whiteRing(brain, this.spot, radius);
          for (const e of brain.targetsNear(this.spot, radius + 2)) {
            if (mark(this.hit, e)) {
              brain.strike(e, DT.TAIL_SWEEP, C.SWEEP_DAMAGE, V.of(e.location).sub(this.spot), C.SWEEP_PUSH_H, C.SWEEP_PUSH_V);
            }
          }
        }
        if (this.stepTicks >= 16) {
          brain.launch(0.3);
          return true;
        }
        break;
      }
    }
    return this.t > 300;
  }
}
