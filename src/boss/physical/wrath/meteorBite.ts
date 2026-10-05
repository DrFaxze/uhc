import { C } from '../../../config';
import { particle, PART } from '../../../core/world';
import { V } from '../../../util/vec';
import { Brain } from '../../brain';
import { DiveBiteAttack } from '../draconic/diveBite';
import { distTo, SND } from '../util';

/** Mordida Meteórica: picado más fuerte; si falla cerca, lanza al objetivo hacia arriba; si acierta, encadena el barrido (MeteorBiteAttack). */
export class MeteorBiteAttack extends DiveBiteAttack {
  private connected = false;

  override name(): string {
    return 'meteor_bite';
  }
  override cooldown(): number {
    return 140;
  }
  protected override damage(): number {
    return C.METEOR_DAMAGE;
  }

  protected override afterHold(brain: Brain): boolean {
    this.connected = this.hit.size > 0;
    if (!this.connected && Brain.valid(this.target) && distTo(brain, this.target) < 14) {
      const at = V.of(this.target.location);
      brain.sound(at, SND.bite, 6, 0.4);
      brain.sound(at, SND.growl, 6, 1.2);
      particle(PART.endRod, at.add(0, 1, 0), 8, 1);
      brain.launchUp(this.target, C.METEOR_LAUNCH);
      brain.log(`mordida meteorica: falla y lanza a ${this.target.typeId} hacia arriba`);
    }
    brain.launch(0.25);
    return true;
  }

  override chainNext(_brain: Brain): string | null {
    return this.connected ? 'sweep' : null;
  }
}
