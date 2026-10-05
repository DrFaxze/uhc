import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { V, wrapDegrees } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { blocking, cloudFx, distTo, SND, sweepFx } from '../util';

enum Step {
  BRAKE,
  TURN,
}

/** Frenada con barrido / Barrido de Retorno: frena tras pasar y gira 180° barriendo con la cola (BrakeSweepAttack). */
export class BrakeSweepAttack extends PhysicalAttack {
  private step = Step.BRAKE;
  private stepTicks = 0;
  private turnPerTick = 0;
  private sweeps = 0;
  private spot = V.ZERO;

  constructor(readonly wrath: boolean) {
    super();
  }

  name(): string {
    return this.wrath ? 'return_sweep' : 'brake_sweep';
  }
  cooldown(): number {
    return 120;
  }
  score(brain: Brain, target: Entity): number {
    if (brain.physical.passedTicks > 0 && this.behind(brain, target) && !(distTo(brain, target) > 14)) {
      return blocking(brain, target) ? 4.5 : 3.0;
    }
    return 0;
  }
  override staysAggressive(): boolean {
    return true;
  }

  override start(brain: Brain, target: Entity): void {
    super.start(brain, target);
    this.beginBrake(brain, 8);
    brain.sound(brain.position(), SND.flap, 10, 0.4);
    const want = Brain.yawTo(brain.position(), target.location);
    const diff = wrapDegrees(want - brain.yaw());
    this.turnPerTick = (diff >= 0 ? 180 : -180) / C.BRAKE_TURN_TICKS;
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.stepTicks++;
    if (this.step === Step.BRAKE) {
      if (this.stepTicks % 2 === 0) {
        cloudFx(brain.part(6), 4, 1.5, 0.5, 1.5, 0.05);
        cloudFx(brain.part(7), 4, 1.5, 0.5, 1.5, 0.05);
      }
      if (this.brakeStep(brain, brain.yaw(), 0)) {
        this.spot = brain.position();
        const floor = brain.groundY(this.spot.x, this.spot.z) + 1.5;
        this.spot = new V(this.spot.x, Math.min(this.spot.y, floor + 2), this.spot.z);
        brain.sound(this.spot, SND.sweep, 8, 0.4);
        this.step = Step.TURN;
        this.stepTicks = 0;
      }
      return false;
    }
    const turnTicks = C.BRAKE_TURN_TICKS;
    if (Brain.valid(this.target)) {
      const to = V.of(this.target.location).sub(this.spot).flat();
      if (to.length() > 3) this.spot = this.spot.add(to.normalize().scale(Math.min(0.45, to.length() - 3)));
    }
    brain.place(this.spot, brain.yaw() + this.turnPerTick);
    const tail = brain.part(5);
    sweepFx(tail.add(0, 0.5, 0), 1, 1, 0.2, 1);
    cloudFx(new V(tail.x, brain.groundY(tail.x, tail.z) + 0.3, tail.z), 2, 1, 0.1, 1, 0.02);
    const damage = this.wrath ? C.RETURN_DAMAGE : C.BRAKE_DAMAGE;
    this.tailHits(brain, C.BRAKE_REACH, (e) =>
      brain.strike(e, DT.TAIL_SWEEP, damage, V.of(e.location).sub(this.spot), 2, 0.6),
    );
    if (this.stepTicks >= turnTicks) {
      this.sweeps++;
      const total = this.wrath ? C.RETURN_SWEEPS : 1;
      if (this.sweeps < total) {
        this.turnPerTick = -this.turnPerTick;
        this.stepTicks = 0;
        this.hit.clear();
        brain.sound(this.spot, SND.sweep, 8, 0.5);
        return false;
      }
      brain.launch(0.35);
      return true;
    }
    return false;
  }
}
