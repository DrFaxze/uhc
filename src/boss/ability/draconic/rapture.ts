import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { POSITION, type Effect } from '../../../fx/effect';
import type { Seat } from '../../../fx/seat';
import { V } from '../../../util/vec';
import type { Ability } from '../../api';
import { Brain, grabMouth } from '../../brain';
import { isPassenger } from './flightUtil';

type Step = 'DIVE' | 'RISE' | 'FLY';

/**
 * Rapto (RaptureAbility): se lanza a por el objetivo más cercano, lo atrapa con las garras, sube
 * RAPTURE_RISE_HEIGHT bloques y vuela en círculo mordiéndolo hasta soltarlo. Con wrath = true es el
 * "Ascenso mortal" (muerde el doble de rápido y bloquea antes la huida).
 */
export class RaptureAbility implements Ability {
  private step: Step = 'DIVE';
  private target: Entity | null = null;
  private seat: Seat | null = null;
  private claws: Effect | null = null;
  private riseFrom = V.ZERO;
  private t = 0;
  private held = 0;
  private angle = 0;

  constructor(readonly wrath: boolean) {}

  private model(): string {
    return this.wrath ? 'mortal_ascent' : 'rapture';
  }

  start(brain: Brain): void {
    this.target = brain.nearestTarget(brain.position(), 160);
    if (this.target) brain.sound(brain.head(), 'mob.enderdragon.growl', 8, this.wrath ? 0.6 : 1.0);
  }

  tick(brain: Brain): boolean {
    const target = this.target;
    if (!target) return true;
    this.t++;
    switch (this.step) {
      case 'DIVE': {
        if (!Brain.valid(target) || this.t > C.RAPTURE_REACH_TICKS) {
          brain.log(`${this.model()}: no lo alcanza`);
          brain.launch(0.5);
          return true;
        }
        const pos = brain.position();
        const aim = Brain.mid(target).sub(brain.forward().scale(5)).add(0, 1, 0);
        const d = aim.sub(pos);
        const next = d.lengthSqr() < 0.001 ? pos : pos.add(d.normalize().scale(Math.min(1.4, d.length())));
        brain.place(next, Brain.yawTo(pos, target.location));
        if (brain.head().distanceTo(Brain.mid(target)) <= 4.5 && !isPassenger(target)) {
          this.grab(brain, target);
          this.step = 'RISE';
          this.riseFrom = brain.position();
          this.t = 0;
        }
        break;
      }
      case 'RISE': {
        if (!this.holding()) return this.escaped(brain);
        this.tickHold(brain);
        const rise = C.RAPTURE_RISE_TICKS;
        const f = Math.min(1, this.t / rise);
        brain.place(this.riseFrom.add(brain.forward().scale(f * 6)).add(0, f * C.RAPTURE_RISE_HEIGHT, 0), brain.yaw());
        this.moveSeat(brain);
        if (this.t >= rise) {
          const rel = brain.position().sub(brain.center());
          this.angle = Math.atan2(rel.z, rel.x);
          this.step = 'FLY';
          this.t = 0;
        }
        break;
      }
      case 'FLY': {
        if (!this.holding()) return this.escaped(brain);
        this.tickHold(brain);
        this.angle += 0.035;
        const c = brain.center();
        const to = c.add(Math.cos(this.angle) * 40, 0, Math.sin(this.angle) * 40);
        brain.fly(new V(to.x, this.riseFrom.y + C.RAPTURE_RISE_HEIGHT, to.z), 0.9, -1);
        this.moveSeat(brain);
        const period = this.wrath ? C.MORTAL_BITE_PERIOD : C.RAPTURE_BITE_PERIOD;
        if (this.t % period === 0 && this.seat) {
          brain.sound(this.seat.position(), 'mob.ravager.bite', 5, this.wrath ? 0.5 : 0.7);
          this.claws?.slot(1, 'bite');
          brain.strike(target, DT.RAPTURE_BITE, C.RAPTURE_BITE_DAMAGE, V.ZERO, 0, 0);
        }
        if (this.t >= C.RAPTURE_FLIGHT_TICKS || !Brain.valid(target)) {
          brain.log(`${this.model()}: suelta a ${target.typeId}`);
          this.release();
          brain.launch(0.6);
          return true;
        }
        break;
      }
    }
    return false;
  }

  private tickHold(brain: Brain): void {
    this.held++;
    const escape = this.wrath ? C.MORTAL_ESCAPE : C.RAPTURE_ESCAPE;
    if (this.seat && !this.seat.locked && this.held >= escape) {
      this.seat.locked = true;
      brain.sound(brain.head(), 'mob.enderdragon.growl', 6, 0.8);
    }
  }

  private escaped(brain: Brain): boolean {
    brain.log(`${this.model()}: ${this.target?.typeId} se ha soltado`);
    this.release();
    brain.launch(0.6);
    return true;
  }

  private holding(): boolean {
    return this.seat !== null && this.seat.valid && Brain.valid(this.target) && this.seat.carries(this.target);
  }

  private grab(brain: Brain, target: Entity): void {
    const m = grabMouth(brain);
    this.seat = brain.newSeat();
    this.seat.mount(target);
    this.claws = brain.fx(this.model(), target.location, 'grab>loop', 1, 0).follow(target, POSITION, 0);
    brain.sound(m, 'mob.ravager.bite', 6, 0.5);
    brain.sound(m, 'mob.enderdragon.growl', 5, 0.5);
    brain.log(`${this.model()}: atrapa a ${target.typeId}`);
  }

  private moveSeat(brain: Brain): void {
    this.seat?.hold(grabMouth(brain));
  }

  private release(): void {
    if (this.claws) {
      this.claws.anims('release').life(10);
      this.claws = null;
    }
    if (this.seat) {
      this.seat.locked = false;
      this.seat.free();
      this.seat = null;
    }
  }

  cancel(_brain: Brain): void {
    this.release();
  }
}
