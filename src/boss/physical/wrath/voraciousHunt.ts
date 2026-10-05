import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { rand } from '../../../util/rand';
import { clamp, V } from '../../../util/vec';
import { Brain } from '../../brain';
import { PhysicalAttack } from '../base';
import { aboveGround, distTo, isPassenger, SND, targetVel } from '../util';

/**
 * Caza Voraz (VoraciousHuntAttack): mordisco recurrente de la Ira en tres variantes encadenables.
 * 1: mordisco; 2: mordisco que empuja hacia el dragón; 3: agarra y lanza hacia atrás.
 */
export class VoraciousHuntAttack extends PhysicalAttack {
  private grabbed = false;
  private holdTicks = 0;

  constructor(readonly variant: number) {
    super();
  }

  name(): string {
    return this.variant === 1 ? 'voracious_hunt' : `voracious_hunt_${this.variant}`;
  }
  cooldown(): number {
    return 20;
  }
  score(brain: Brain, target: Entity): number {
    if (this.variant !== 1) return 0;
    return aboveGround(brain, target) > 5 ? 0 : 1.6;
  }
  override staysAggressive(): boolean {
    return true;
  }

  override chainNext(_brain: Brain): string | null {
    if (this.variant === 1 && this.hit.size > 0) {
      const roll = rand.nextDouble();
      if (roll < C.HUNT_CHAIN_V2) return 'voracious_hunt_2';
      return roll < C.HUNT_CHAIN_V2 + C.HUNT_CHAIN_SWEEP ? 'sweep' : 'predator_ascent';
    }
    return this.variant === 2 && this.hit.size > 0 ? 'voracious_hunt_3' : null;
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.grabbed) return this.tickGrab(brain);
    if (!Brain.valid(this.target) || this.t > (this.variant === 1 ? 200 : 100)) return true;
    const pos = V.of(this.target.location);
    const vel = targetVel(this.target);
    const speed = C.PASS_SPEED;
    const lead = clamp(distTo(brain, this.target) / Math.max(0.1, speed), 0, 12);
    brain.fly(pos.add(vel.scale(lead)), speed, 1.2);
    if (this.behind(brain, this.target) && distTo(brain, this.target) < 12) brain.physical.passedTicks = 30;
    const head = brain.head();
    if (head.distanceTo(Brain.mid(this.target)) > C.BITE_REACH + 0.5) return false;
    brain.sound(head, SND.bite, 5, 0.5);
    PhysicalAttack.whiteBurst(brain, head, 18, 0.6);
    this.hit.add(this.target.id);
    if (this.variant === 3) {
      if (!isPassenger(this.target)) {
        this.grab(brain);
        this.grabbed = true;
        return false;
      }
      return true;
    }
    const dir = this.variant === 2 ? brain.position().sub(this.target.location) : brain.forward();
    brain.strike(this.target, DT.BITE, C.HUNT_BITE_DAMAGE, dir, this.variant === 2 ? 1.0 : 0.15, 0.1);
    return true;
  }

  private tickGrab(brain: Brain): boolean {
    if (!this.holding()) {
      this.release();
      return true;
    }
    this.holdTicks++;
    brain.fly(brain.position().add(brain.forward().scale(10)), C.CHASE_SPEED, 4);
    this.moveSeat(brain);
    if (this.holdTicks >= 40) {
      const victim = this.target;
      const back = brain.forward().scale(-1);
      this.release();
      brain.strike(victim, DT.GRAB_SLAM, C.HUNT_THROW_DAMAGE, back, 2.6, 0.8);
      brain.sound(brain.head(), SND.knockback, 6, 0.5);
      return true;
    }
    return false;
  }
}
