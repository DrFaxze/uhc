import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { clamp, V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, distTo, isPassenger, SND, targetVel } from '../util';

/**
 * Sed de Sangre: mordisco que cura al dragón y agarre con mordiscos periódicos que también curan
 * (BloodthirstAttack). Si el escudo para un mordisco, strike devuelve false: no cura y el escudo se desactiva.
 */
export class BloodthirstAttack extends PhysicalAttack {
  private grabbed = false;
  private held = 0;

  name(): string {
    return 'bloodthirst';
  }
  cooldown(): number {
    return 200;
  }
  score(brain: Brain, target: Entity): number {
    if (!(aboveGround(brain, target) > 5) && !isPassenger(target)) {
      return brain.physical.groupSize(target, 8) > 1 ? 0.8 : 1.4;
    }
    return 0;
  }
  override staysAggressive(): boolean {
    return true;
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.grabbed) return this.tickHold(brain);
    if (!Brain.valid(this.target) || this.t > 200) return true;
    const pos = V.of(this.target.location);
    const vel = targetVel(this.target);
    const speed = C.PASS_SPEED;
    const lead = clamp(distTo(brain, this.target) / Math.max(0.1, speed), 0, 12);
    brain.fly(pos.add(vel.scale(lead)), speed, 1.2);
    const head = brain.head();
    if (head.distanceTo(Brain.mid(this.target)) > C.BITE_REACH + 0.5) return false;
    brain.sound(head, SND.bite, 5, 0.4);
    PhysicalAttack.whiteBurst(brain, head, 20, 0.6);
    if (brain.strike(this.target, DT.BLOODTHIRST, C.BLOODTHIRST_DAMAGE, brain.forward(), 0.1, 0.05)) {
      brain.heal(C.BLOODTHIRST_HEAL);
    }
    if (Brain.valid(this.target) && !isPassenger(this.target)) {
      this.grab(brain);
      this.grabbed = true;
      return false;
    }
    return true;
  }

  private tickHold(brain: Brain): boolean {
    if (!this.holding()) {
      brain.log(`sanguinario: ${Brain.valid(this.target) ? this.target.typeId : '?'} se ha soltado`);
      this.release();
      return true;
    }
    this.held++;
    if (!this.seat!.locked && this.held >= C.BLOODTHIRST_ESCAPE) this.seat!.locked = true;
    brain.fly(brain.position().add(brain.forward().scale(10)), C.CHASE_SPEED, 6);
    this.moveSeat(brain);
    if (this.held % C.BLOODTHIRST_PERIOD === 0) {
      const m = PhysicalAttack.mouth(brain);
      brain.sound(m, SND.bite, 4, 0.6);
      PhysicalAttack.whiteBurst(brain, m.add(0, 1, 0), 6, 0.4);
      if (brain.strike(this.target, DT.BLOODTHIRST_BITE, C.BLOODTHIRST_BITE, V.ZERO, 0, 0)) {
        brain.heal(C.BLOODTHIRST_HEAL);
      }
    }
    if (this.held >= C.BLOODTHIRST_HOLD) {
      this.release();
      brain.launch(0.3);
      return true;
    }
    return false;
  }
}
