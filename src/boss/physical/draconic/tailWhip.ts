import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { blocking, SND, sweepFx } from '../util';

/** Coletazo: pasada sobre el grupo y latigazo de cola al cruzarlo (TailWhipAttack). */
export class TailWhipAttack extends PhysicalAttack {
  private center = V.ZERO;
  private exit = V.ZERO;
  private dir = V.ZERO;
  private whip = -1;
  private sign = 1;

  name(): string {
    return 'tail_whip';
  }
  cooldown(): number {
    return 160;
  }
  score(brain: Brain, target: Entity): number {
    const n = brain.physical.groupSize(target, 6);
    const s = n >= 2 ? 1.8 + 0.4 * (n - 2) : 0.4;
    return blocking(brain, target) ? s * 1.5 : s;
  }

  override start(brain: Brain, target: Entity): void {
    super.start(brain, target);
    this.center = brain.physical.groupCenter(target);
    let d = this.center.sub(brain.position()).flat();
    d = d.lengthSqr() < 1 ? brain.forward() : d.normalize();
    this.dir = d;
    this.exit = this.center.add(d.scale(20));
    this.sign = rand.nextBoolean() ? 1 : -1;
  }

  tick(brain: Brain): boolean {
    this.t++;
    brain.fly(this.exit, C.PASS_SPEED, 2);
    const body = brain.position();
    const past = body.sub(this.center).dot(this.dir);
    const near = PhysicalAttack.flatDist(body, this.center);
    if (this.whip < 0 && ((past > 2 && near < 9) || near < 3)) {
      this.whip = 0;
      brain.sound(body, SND.flap, 6, 0.6);
      brain.sound(body, SND.sweep, 6, 0.5);
    }
    if (this.whip >= 0 && this.whip < 10) {
      const step = (this.whip < 5 ? 10 : -10) * this.sign;
      // setYRot: el FlightController aplica luego la intención con este yaw
      brain.flight.yaw += step;
      this.whip++;
      const tail = brain.part(5);
      sweepFx(tail.add(0, 1, 0), 2, 1.5, 0.3, 1.5);
      this.tailHits(brain, C.WHIP_REACH, (e) =>
        brain.strike(e, DT.TAIL_WHIP, C.WHIP_DAMAGE, V.of(e.location).sub(brain.position()), C.WHIP_PUSH_H, C.WHIP_PUSH_V),
      );
    }
    const passed = this.whip >= 10 && PhysicalAttack.flatDist(body, this.center) > 12;
    if (!passed && this.t <= 220) return false;
    brain.physical.passedTicks = 30;
    return true;
  }
}
