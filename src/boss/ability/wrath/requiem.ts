import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT, push } from '../../../core/damage';
import { HEAD, type Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';

/**
 * Réquiem (RequiemAbility): el dragón carga un orbe que persigue al objetivo; al impactar golpea, atrae a
 * los cercanos y deja una resonancia que hace daño verdadero periódico.
 */
export class RequiemAbility implements Ability {
  private target: Entity | null = null;
  private charge: Effect | null = null;
  private t = 0;

  start(brain: Brain): void {
    this.target = brain.nearestTarget(brain.position(), C.REQUIEM_RANGE);
    if (this.target) {
      this.charge = brain.fx('requiem_charge', brain.head(), 'charge', 1, 0).follow(brain.dragon, HEAD, 0);
      brain.sound(brain.head(), 'beacon.ambient', 8, 0.5);
    }
  }

  tick(brain: Brain): boolean {
    if (!this.target) return true;
    this.t++;
    brain.hold(Brain.valid(this.target) ? this.target.location : null, 4);
    const charge = C.REQUIEM_CHARGE;
    if (this.t % 40 === 0 && this.t < charge) brain.sound(brain.head(), 'block.amethyst_block.chime', 8, 0.5 + this.t / charge);
    if (this.t < charge) return false;
    this.charge?.anims('release').life(10);
    const from = brain.mouth();
    const orb = brain.fx('requiem_orb', from, 'fly', 1, 0);
    brain.addTask(new Orb(orb, this.target));
    brain.sound(from, 'mob.warden.sonic_boom', 10, 1.4);
    return true;
  }

  cancel(_brain: Brain): void {
    this.charge?.discard();
  }
}

class Orb implements Task {
  private aim: V;
  private t = 0;
  private resonance: Effect | null = null;
  private at = V.ZERO;
  private resT = -1;

  constructor(
    private readonly orb: Effect,
    private readonly target: Entity,
  ) {
    this.aim = Brain.mid(target);
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.resT >= 0) return this.resonate(brain);
    if (Brain.valid(this.target)) this.aim = Brain.mid(this.target);
    const pos = this.orb.position();
    const d = this.aim.sub(pos);
    const speed = C.REQUIEM_SPEED;
    if (d.length() > speed + 1 && this.t <= 300) {
      this.orb.moveTo(pos.add(d.normalize().scale(speed)));
      this.orb.faceDir(d);
      return false;
    }
    this.impact(brain, this.aim);
    return false;
  }

  private impact(brain: Brain, at: V): void {
    this.at = at;
    this.orb.discard();
    brain.sound(at, 'mob.warden.sonic_boom', 12, 0.6);
    brain.sound(at, 'block.bell.hit', 10, 0.6);
    for (const e of brain.targetsNear(at, 8)) brain.strike(e, DT.REQUIEM, C.REQUIEM_DAMAGE);
    for (const e of brain.targetsNear(at, 20)) {
      const dir = at.sub(e.location).normalize().scale(C.REQUIEM_PULL);
      push(e, dir.x, Math.max(0.2, dir.y), dir.z);
    }
    this.resonance = brain.fx('requiem_resonance', at, 'impact>resonate', 1, 0);
    this.resT = 0;
  }

  private resonate(brain: Brain): boolean {
    this.resT++;
    const life = C.REQUIEM_RESONANCE;
    if (this.resT % C.REQUIEM_PERIOD === 0 && this.resT <= life) {
      brain.sound(this.at, 'block.bell.hit', 8, 0.5);
      for (const e of brain.targetsNear(this.at, C.REQUIEM_RES_RADIUS)) {
        brain.strike(e, DT.REQUIEM_RESONANCE, C.REQUIEM_RES_DAMAGE, V.of(e.location).sub(this.at), 0.3, 0.2);
      }
    }
    if (this.resT === life) this.resonance?.anims('fade').life(22);
    return this.resT > life + 22;
  }

  cancel(_brain: Brain): void {
    this.orb.discard();
    this.resonance?.discard();
  }
}
