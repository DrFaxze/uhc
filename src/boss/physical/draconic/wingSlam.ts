import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, cloudFx, mark, SND } from '../util';

enum Step {
  APPROACH,
  BRAKE,
  DESCEND,
  HOLD,
  TAKEOFF,
}

/** Aletazo / Ruptura Alada: frena, baja al suelo y golpea con las alas (WingSlamAttack). */
export class WingSlamAttack extends PhysicalAttack {
  private step = Step.APPROACH;
  private stepTicks = 0;
  private base = V.ZERO;
  private groundYV = 0;

  constructor(readonly wrath: boolean) {
    super();
  }

  name(): string {
    return this.wrath ? 'wing_rupture' : 'wing_slam';
  }
  cooldown(): number {
    return this.wrath ? 140 : 200;
  }
  score(brain: Brain, target: Entity): number {
    let s = 0.6;
    if (brain.physical.groupSize(target, 10) >= 2) s++;
    if (brain.targetsNear(brain.position(), 10).length > 0) s++;
    return aboveGround(brain, target) > 3 ? 0 : s;
  }

  private go(s: Step): void {
    this.step = s;
    this.stepTicks = 0;
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.stepTicks++;
    switch (this.step) {
      case Step.APPROACH:
        if (!Brain.valid(this.target)) return true;
        brain.fly(this.target.location, C.CHASE_SPEED, 3);
        if (PhysicalAttack.flatDist(brain.position(), this.target.location) < 7 || this.stepTicks > 160) {
          this.beginBrake(brain, 10);
          this.go(Step.BRAKE);
        }
        break;
      case Step.BRAKE:
        if (this.brakeStep(brain, brain.yaw(), 0)) {
          this.base = brain.position();
          this.groundYV = brain.groundY(this.base.x, this.base.z);
          brain.sound(this.base, SND.flap, 8, 0.5);
          this.go(Step.DESCEND);
        }
        break;
      case Step.DESCEND: {
        const tele = Math.max(1, C.SLAM_TELEGRAPH);
        const f = Math.min(1, this.stepTicks / tele);
        const y = this.base.y + (this.groundYV + 0.6 - this.base.y) * f;
        brain.place(new V(this.base.x, y, this.base.z), brain.yaw());
        if (this.stepTicks % 3 === 0) {
          for (const w of [brain.part(6), brain.part(7)]) {
            cloudFx(new V(w.x, this.groundYV + 0.5, w.z), 6, 2, 0.2, 2, 0.02);
          }
        }
        if (this.stepTicks >= tele) {
          this.slam(brain);
          this.go(Step.HOLD);
        }
        break;
      }
      case Step.HOLD:
        brain.place(brain.position(), brain.yaw());
        if (this.stepTicks >= 10) {
          this.base = brain.position();
          this.go(Step.TAKEOFF);
        }
        break;
      case Step.TAKEOFF:
        brain.place(this.base.add(0, this.stepTicks * 0.25, 0), brain.yaw());
        if (this.stepTicks >= 12) {
          brain.launch(0.2);
          return true;
        }
        break;
    }
    return this.t > 400;
  }

  private slam(brain: Brain): void {
    const radius = this.wrath ? C.RUPTURE_RADIUS : C.SLAM_RADIUS;
    const damage = this.wrath ? C.RUPTURE_DAMAGE : C.SLAM_DAMAGE;
    const body = brain.position();
    brain.sound(body, SND.explode, 6, 0.6);
    brain.sound(body, SND.flap, 10, 0.3);
    brain.log(`${this.name()}: ondas`);
    for (const wing of [brain.part(6), brain.part(7)]) {
      const w = new V(wing.x, brain.groundY(wing.x, wing.z), wing.z);
      PhysicalAttack.whiteRing(brain, w, radius);
      particle(PART.explosion, w.add(0, 0.5, 0), 2, 1);
      const side = w.sub(body);
      for (const e of brain.targetsNear(w.add(0, 1, 0), radius)) {
        if (mark(this.hit, e)) {
          const out = V.of(e.location).sub(body);
          brain.strike(e, DT.SLAM, damage, out.lengthSqr() < 1 ? side : out, 1.8, 0.6);
        }
      }
    }
  }
}
