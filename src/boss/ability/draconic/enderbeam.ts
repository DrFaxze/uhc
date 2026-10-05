import { Player, type Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { blockHit } from '../../../core/world';
import { POSITION, type Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability } from '../../api';
import { Brain } from '../../brain';
import { segmentDistance } from './flightUtil';

/**
 * Rayo del End (EnderbeamAbility): marca al objetivo más cercano y, tras la carga, dispara un haz desde la
 * boca que le sigue con retraso. Con deathBeam = true es el "Rayo de la muerte" de la ira (solo jugadores).
 */
export class EnderbeamAbility implements Ability {
  private target: Entity | null = null;
  private mark: Effect | null = null;
  private beam: Effect | null = null;
  private impact: Effect | null = null;
  private dir = V.ZERO;
  private t = 0;

  constructor(readonly deathBeam: boolean) {}

  private markTicks(): number {
    return this.deathBeam ? C.DEATH_BEAM_MARK : C.BEAM_MARK;
  }
  private fireTicks(): number {
    return this.deathBeam ? C.DEATH_BEAM_FIRE : C.BEAM_FIRE;
  }
  private length(): number {
    return this.deathBeam ? C.DEATH_BEAM_RANGE : C.BEAM_LENGTH;
  }
  private prefix(): string {
    return this.deathBeam ? 'death_beam' : 'enderbeam';
  }

  start(brain: Brain): void {
    const range = this.deathBeam ? C.DEATH_BEAM_RANGE : C.BEAM_RANGE;
    this.target = brain.nearestTarget(brain.position(), range);
    if (this.target) {
      this.mark = brain.fx(`${this.prefix()}_mark`, this.target.location, 'mark>loop', 0.85, 0).follow(this.target, POSITION, 0.05);
      brain.sound(brain.head(), 'beacon.activate', 6, this.deathBeam ? 0.5 : 0.8);
      this.dir = Brain.mid(this.target).sub(brain.mouth()).normalize();
    }
  }

  tick(brain: Brain): boolean {
    if (!this.target) return true;
    this.t++;
    const alive = Brain.valid(this.target);
    brain.hold(alive ? this.target.location : null, 3);
    const mouth = brain.mouth();
    if (alive) {
      const want = Brain.mid(this.target).sub(mouth).normalize();
      this.dir = this.dir.add(want.sub(this.dir).scale(0.12)).normalize();
    }
    const mark = this.markTicks();
    if (this.t < mark) return false;
    const end = this.end(mouth);
    if (this.t === mark) {
      this.mark?.discard();
      brain.sound(mouth, 'mob.warden.sonic_boom', 6, this.deathBeam ? 0.5 : 1.2);
      this.beam = brain.fx(this.prefix(), mouth, 'fire>loop', 1, 0);
      this.impact = brain.fx(`${this.prefix()}_impact`, end, 'loop', 1, 0);
    }
    if (this.beam) {
      this.beam.moveTo(mouth);
      this.beam.aimAt(end);
    }
    this.impact?.moveTo(end);
    const period = this.deathBeam ? C.DEATH_BEAM_PERIOD : C.BEAM_PERIOD;
    if ((this.t - mark) % period === 0) this.damage(brain, mouth, end);
    if (this.t >= mark + this.fireTicks()) {
      this.cancel(brain);
      return true;
    }
    return false;
  }

  /** Fin del haz: el primer bloque sólido o el alcance máximo. */
  private end(mouth: V): V {
    const far = mouth.add(this.dir.scale(this.length()));
    return blockHit(mouth, far) ?? far;
  }

  private damage(brain: Brain, from: V, to: V): void {
    const dmg = this.deathBeam ? C.DEATH_BEAM_DAMAGE : C.BEAM_DAMAGE;
    for (const e of brain.targets()) {
      if (this.deathBeam && !(e instanceof Player)) continue;
      if (segmentDistance(from, to, Brain.mid(e)) <= 1.6) brain.strike(e, DT.DEATH_RAY, dmg, V.ZERO, 0, 0);
    }
  }

  cancel(_brain: Brain): void {
    for (const fx of [this.mark, this.beam, this.impact]) fx?.discard();
  }
}
