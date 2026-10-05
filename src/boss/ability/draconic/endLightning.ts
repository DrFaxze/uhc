import { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { POSITION, type Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';

/**
 * Rayo del End: marca a un objetivo, carga en la boca y lanza dos descargas (la segunda deja el suelo
 * electrificado). Con `intercept` (Cruz de Intercepción, ira) la marca es una cruz fija que detona en sus brazos.
 */
export class EndLightningAbility implements Ability {
  private target: Entity | null = null;
  private mark: Effect | null = null;
  private markAt = V.ZERO;
  private t = 0;

  constructor(readonly intercept: boolean) {}

  start(brain: Brain): void {
    this.target = brain.randomTarget(brain.position(), C.LIGHTNING_RANGE);
    if (!this.target) return;
    this.markAt = brain.ground(this.target.location);
    if (this.intercept) {
      this.mark = brain.fx('intercept_cross', this.markAt.add(0, 0.05, 0), 'mark', 1, 0);
    } else {
      this.mark = brain.fx('end_lightning_mark', this.markAt, 'mark>loop', 0.85, 0).follow(this.target, POSITION, 0.05);
    }
    brain.sound(this.markAt, 'beacon.power', 6, 1.6);
  }

  tick(brain: Brain): boolean {
    if (!this.target) return true;
    this.t++;
    const mark = C.LIGHTNING_MARK;
    const gap = C.LIGHTNING_GAP;
    if (this.t < mark) {
      const mouth = brain.mouth();
      const k = this.t / Math.max(1, mark);
      if (this.t % 2 === 0) particle(PART.electric, mouth, 1 + Math.floor(k * 4), 0.4 + k);
      if (this.t % 20 === 0) brain.sound(mouth, 'beacon.ambient', 6, 0.6 + k * 1.2);
    }
    if (this.t === mark) {
      this.pulse(brain, 1);
      if (this.intercept && this.mark) this.mark.anims('expand');
    } else if (this.t === mark + gap) {
      this.pulse(brain, 2);
      if (this.mark) {
        if (this.intercept) {
          this.mark.anims('detonate>fade').life(30);
          this.crossDamage(brain);
        } else {
          this.mark.discard();
        }
      }
    }
    return this.t >= mark + gap + 12;
  }

  private pulse(brain: Brain, n: number): void {
    const mouth = brain.mouth();
    const at = Brain.valid(this.target) ? Brain.mid(this.target) : this.markAt.add(0, 1, 0);
    const model = this.intercept ? 'intercept_beam' : 'end_lightning';
    brain.fx(model, mouth, n === 1 ? 'pulse1' : 'pulse2', 1, n === 1 ? 10 : 14).aimAt(at);
    brain.sound(at, 'ambient.weather.thunder', 8, n === 1 ? 1.4 : 0.8);
    brain.sound(at, 'ambient.weather.lightning.impact', 6, 1);
    const damage = n === 1 ? (this.intercept ? C.INTERCEPT_DAMAGE_1 : C.LIGHTNING_DAMAGE_1) : this.intercept ? C.INTERCEPT_DAMAGE_2 : C.LIGHTNING_DAMAGE_2;
    const push = n === 1 ? C.LIGHTNING_PUSH_1 : C.LIGHTNING_PUSH_2;
    for (const e of brain.targetsNear(at, 2.5)) {
      brain.strike(e, DT.ELECTRIC, damage, V.of(e.location).sub(mouth), push, n === 1 ? 0.9 : 0.15);
    }
    if (n === 2) {
      const ground = brain.ground(at);
      if (this.intercept) {
        brain.fx('intercept_burst', at, 'burst', 1, 14);
      } else {
        brain.addTask(new Electrified(brain.fx('electrified_ground', ground.add(0, 0.05, 0), 'loop', 1, C.LIGHTNING_GROUND_TICKS), ground));
      }
    }
  }

  private crossDamage(brain: Brain): void {
    const arm = C.INTERCEPT_ARM;
    for (const e of brain.targetsNear(this.markAt, arm + 1)) {
      const dx = Math.abs(e.location.x - this.markAt.x);
      const dz = Math.abs(e.location.z - this.markAt.z);
      if ((dx <= 1.5 && dz <= arm) || (dz <= 1.5 && dx <= arm)) {
        brain.strike(e, DT.ELECTRIC, C.INTERCEPT_DAMAGE_2 * 0.5, V.of(e.location).sub(this.markAt), 0.6, 0.5);
      }
    }
  }

  cancel(_brain: Brain): void {
    this.mark?.discard();
  }
}

/** Suelo electrificado: lentitud III y daño cada segundo. */
class Electrified implements Task {
  private t = 0;

  constructor(
    private readonly fx: Effect,
    private readonly at: V,
  ) {}

  tick(brain: Brain): boolean {
    this.t++;
    if (this.t % 10 === 0) {
      const r = C.LIGHTNING_GROUND_RADIUS;
      for (const e of brain.targetsNear(this.at.add(0, 1, 0), r)) {
        try {
          e.addEffect('slowness', 30, { amplifier: 2, showParticles: true });
        } catch {
          /* ignorar */
        }
        if (this.t % 20 === 0) brain.strike(e, DT.ELECTRIC, C.LIGHTNING_GROUND_DAMAGE, V.ZERO, 0, 0);
      }
      if (this.t % 20 === 0) particle(PART.electric, this.at.add(0, 0.5, 0), 2, r * 0.5);
    }
    return this.fx.isRemoved() || this.t >= C.LIGHTNING_GROUND_TICKS;
  }

  cancel(_brain: Brain): void {
    this.fx.discard();
  }
}
