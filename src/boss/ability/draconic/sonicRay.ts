import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { HEAD, POSITION, type Effect } from '../../../fx/effect';
import type { Ability } from '../../api';
import { Brain } from '../../brain';
import { segmentDistance } from './flightUtil';

/** Rayo sónico (SonicRayAbility): carga SONIC_CHARGE ticks fijando al objetivo y suelta un único rayo. */
export class SonicRayAbility implements Ability {
  private target: Entity | null = null;
  private charge: Effect | null = null;
  private selector: Effect | null = null;
  private t = 0;

  start(brain: Brain): void {
    this.target = brain.nearestTarget(brain.position(), C.SONIC_RANGE);
    if (this.target) {
      this.charge = brain.fx('sonic_charge', brain.head(), 'charge', 1, 0).follow(brain.dragon, HEAD, 0);
      this.selector = brain.fx('sonic_target', this.target.location, 'charge', 0.85, 0).follow(this.target, POSITION, 0.05);
      brain.sound(brain.head(), 'mob.warden.sonic_charge', 8, 0.6);
    }
  }

  tick(brain: Brain): boolean {
    if (!this.target) return true;
    this.t++;
    brain.hold(Brain.valid(this.target) ? this.target.location : null, 4);
    const charge = C.SONIC_CHARGE;
    if (this.t % 40 === 0 && this.t < charge) brain.sound(brain.head(), 'mob.warden.sonic_charge', 6, 0.6 + (this.t / charge) * 0.6);
    if (this.t === charge) this.fire(brain);
    return this.t >= charge + 18;
  }

  private fire(brain: Brain): void {
    const mouth = brain.mouth();
    const aim = this.target && Brain.valid(this.target) ? Brain.mid(this.target) : mouth.add(brain.forward().scale(30));
    const dir = aim.sub(mouth).normalize();
    const end = mouth.add(dir.scale(Math.min(C.SONIC_RANGE, aim.distanceTo(mouth) + 6)));
    this.charge?.anims('release').life(12);
    this.selector?.anims('lock').life(12);
    brain.fx('sonic_beam', mouth, 'fire>loop', 1, 18).aimAt(end);
    brain.fx('sonic_impact', aim, 'hit', 1, 18);
    brain.sound(mouth, 'mob.warden.sonic_boom', 10, 0.6);
    for (const e of brain.targets()) {
      if (segmentDistance(mouth, end, Brain.mid(e)) <= 2.5) {
        brain.strike(e, DT.SONIC_RAY, C.SONIC_DAMAGE, dir, C.SONIC_PUSH_H, C.SONIC_PUSH_V);
      }
    }
  }

  cancel(_brain: Brain): void {
    this.charge?.discard();
    this.selector?.discard();
  }
}
