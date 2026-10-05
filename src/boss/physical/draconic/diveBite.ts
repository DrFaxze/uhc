import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { forward, V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, distTo, flashFx, mark, SND } from '../util';

export enum DiveStep {
  APPROACH,
  BRAKE,
  TELEGRAPH,
  LUNGE,
  HOLD,
}

/** Mordisco en picado: se coloca, frena, avisa y se lanza en picado a morder (DiveBiteAttack). */
export class DiveBiteAttack extends PhysicalAttack {
  protected step = DiveStep.APPROACH;
  protected stepTicks = 0;
  private base = V.ZERO;
  private lungeTo = V.ZERO;
  private lungeYaw = 0;

  name(): string {
    return 'dive_bite';
  }
  cooldown(): number {
    return 160;
  }
  score(brain: Brain, target: Entity): number {
    const above = aboveGround(brain, target);
    const d = distTo(brain, target);
    return above < 1.5 && d > 10 && d < 45 ? 1.4 : 0;
  }

  protected damage(): number {
    return C.DIVE_DAMAGE;
  }

  protected go(s: DiveStep): void {
    this.step = s;
    this.stepTicks = 0;
  }

  protected afterHold(brain: Brain): boolean {
    brain.launch(0.25);
    return true;
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.stepTicks++;
    if (!Brain.valid(this.target) && this.step < DiveStep.LUNGE) {
      brain.launch(0.2);
      return true;
    }
    switch (this.step) {
      case DiveStep.APPROACH: {
        const tp = V.of(this.target.location);
        let away = brain.position().sub(tp).flat();
        away = away.lengthSqr() < 1 ? brain.forward().scale(-1) : away.normalize();
        const spot = tp.add(away.scale(14));
        brain.fly(spot, C.CHASE_SPEED, 4);
        if (PhysicalAttack.flatDist(brain.position(), spot) < 4 || this.stepTicks > 160) {
          this.beginBrake(brain, 12);
          this.go(DiveStep.BRAKE);
        }
        break;
      }
      case DiveStep.BRAKE:
        if (this.brakeStep(brain, Brain.yawTo(brain.position(), this.target.location), 10)) {
          this.base = brain.position();
          brain.sound(brain.head(), SND.growl, 5, 1.4);
          brain.log(`${this.name()}: aviso`);
          this.go(DiveStep.TELEGRAPH);
        }
        break;
      case DiveStep.TELEGRAPH: {
        const tele = C.DIVE_TELEGRAPH;
        const rise = Math.min(1, this.stepTicks / Math.max(1, tele));
        const yaw = PhysicalAttack.turn(brain.yaw(), Brain.yawTo(brain.position(), this.target.location), 6);
        brain.place(this.base.add(0, rise * 1.5, 0), yaw);
        if (this.stepTicks % 2 === 0) {
          const h = brain.head();
          particle(PART.endRod, h, 2, 0.8);
          flashFx(h);
        }
        if (this.stepTicks >= tele) {
          const aim = V.of(this.target.location);
          this.lungeYaw = Brain.yawTo(brain.position(), aim);
          const fwd = forward(this.lungeYaw);
          const bodyGoal = aim.sub(fwd.scale(5.5));
          let flat = bodyGoal.sub(brain.position()).flat();
          if (flat.dot(fwd) < 0) flat = V.ZERO;
          else if (flat.length() > 7) flat = flat.normalize().scale(7);
          const y = Math.max(brain.groundY(aim.x, aim.z), aim.y - 2);
          const p = brain.position();
          this.lungeTo = new V(p.x + flat.x, y, p.z + flat.z);
          this.base = p;
          brain.sound(brain.head(), SND.flap, 6, 1.3);
          this.go(DiveStep.LUNGE);
        }
        break;
      }
      case DiveStep.LUNGE: {
        const f = Math.min(1, this.stepTicks / 4);
        brain.place(this.base.lerp(this.lungeTo, f), this.lungeYaw);
        this.bite(brain);
        if (this.stepTicks >= 4) this.go(DiveStep.HOLD);
        break;
      }
      case DiveStep.HOLD:
        brain.place(this.lungeTo, brain.yaw());
        this.bite(brain);
        if (this.stepTicks >= 12) return this.afterHold(brain);
        break;
    }
    return this.t > 400;
  }

  private bite(brain: Brain): void {
    const head = brain.head();
    const reach = C.DIVE_REACH;
    for (const e of brain.targets()) {
      const y = e.location.y;
      const inReach = PhysicalAttack.flatDist(head, e.location) <= reach && head.y - y <= 4 && y - head.y <= 2;
      if (inReach && mark(this.hit, e)) {
        brain.sound(head, SND.bite, 5, 0.5);
        PhysicalAttack.whiteBurst(brain, head, 20, 0.6);
        brain.strike(e, DT.BITE, this.damage(), brain.forward(), 0.6, 0.2);
      }
    }
  }
}
