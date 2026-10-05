import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { clamp, V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, distTo, SND, targetVel } from '../util';

/** Mordisco: persigue con anticipación y muerde al alcanzar (BiteAttack). */
export class BiteAttack extends PhysicalAttack {
  name(): string {
    return 'bite';
  }
  cooldown(): number {
    return 40;
  }
  score(brain: Brain, target: Entity): number {
    if (aboveGround(brain, target) > 5) return 0;
    return distTo(brain, target) < 24 ? 1.4 : 1.0;
  }
  tick(brain: Brain): boolean {
    this.t++;
    if (!Brain.valid(this.target) || this.t > C.BITE_CHASE_TICKS) {
      brain.log(`mordisco: desiste tras ${this.t} ticks`);
      return true;
    }
    const pos = V.of(this.target.location);
    const vel = targetVel(this.target);
    const speed = C.CHASE_SPEED;
    const lead = clamp(distTo(brain, this.target) / Math.max(0.1, speed), 0, 15);
    brain.fly(pos.add(vel.scale(lead)), speed, 1.2);
    if (this.behind(brain, this.target) && distTo(brain, this.target) < 12) brain.physical.passedTicks = 30;
    const head = brain.head();
    if (head.distanceTo(Brain.mid(this.target)) <= C.BITE_REACH) {
      brain.sound(head, SND.bite, 4, 0.6);
      brain.sound(head, SND.strong, 3, 0.6);
      PhysicalAttack.whiteBurst(brain, head, 16, 0.6);
      brain.strike(this.target, DT.BITE, C.BITE_DAMAGE, brain.forward(), C.BITE_PUSH, 0.05);
      return true;
    }
    return false;
  }
}
