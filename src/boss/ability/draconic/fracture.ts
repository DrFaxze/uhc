import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { V } from '../../../util/vec';
import type { Ability } from '../../api';
import type { Brain } from '../../brain';

/** Fractura: el suelo bajo el dragón se hunde (atrae a 40 ticks) y estalla (empuja a 60 ticks). */
export class FractureAbility implements Ability {
  private at = V.ZERO;
  private t = 0;

  start(brain: Brain): void {
    this.at = brain.ground(brain.position());
    const r = C.FRACTURE_RADIUS;
    brain.fx('fracture', this.at.add(0, 0.05, 0), 'mark>collapse>pull>push>settle', r / 16, 112);
    brain.sound(this.at, 'mob.enderdragon.growl', 8, 0.6);
  }

  tick(brain: Brain): boolean {
    this.t++;
    const r = C.FRACTURE_RADIUS;
    if (this.t === 20) brain.sound(this.at, 'random.explode', 8, 0.5);
    if (this.t === 40) {
      brain.sound(this.at, 'mob.warden.sonic_boom', 10, 0.5);
      for (let i = 0; i < 12; i++) {
        particle(PART.explosion, this.at.add((Math.random() - 0.5) * r, 1 + (Math.random() - 0.5), (Math.random() - 0.5) * r));
      }
      for (const e of brain.targetsNear(this.at.add(0, 1, 0), r)) {
        brain.strike(e, DT.FRACTURE, C.FRACTURE_DAMAGE, this.at.sub(e.location), C.FRACTURE_PULL, 0.4);
      }
    }
    if (this.t === 60) {
      brain.sound(this.at, 'random.explode', 10, 0.6);
      brain.addWave(this.at, r, 10, false);
      for (const e of brain.targetsNear(this.at.add(0, 1, 0), r)) {
        brain.strike(e, DT.FRACTURE, C.FRACTURE_DAMAGE, V.of(e.location).sub(this.at), C.FRACTURE_PUSH_H, C.FRACTURE_PUSH_V);
      }
    }
    return this.t >= 90;
  }
}
