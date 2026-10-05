import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { Effect, POSITION } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability } from '../../api';
import { Brain } from '../../brain';

/**
 * Embestida (RushAbility): aparece a 14 bloques del objetivo más cercano, 12 por encima, y se lanza hacia
 * él; al llegar (o a los RUSH_MAX_TICKS) golpea en un radio alrededor de la cabeza. Verdugo la extiende.
 */
export class RushAbility implements Ability {
  protected target: Entity | null = null;
  protected aura: Effect | null = null;
  protected t = 0;
  protected struck = false;
  protected readonly hit = new Set<string>();

  constructor(readonly wrath: boolean) {}

  protected auraModel(): string {
    return 'rush_aura';
  }

  protected speed(): number {
    return C.RUSH_SPEED;
  }

  start(brain: Brain): void {
    this.target = brain.nearestTarget(brain.position(), C.RUSH_RANGE);
    if (this.target === null) {
      brain.replaceAbility(this.wrath ? 'death_beam' : 'enderbeam');
      return;
    }
    const tp = V.of(this.target.location);
    let away = brain.position().sub(tp).flat();
    away = away.lengthSqr() < 1 ? new V(1, 0, 0) : away.normalize();
    const to = tp.add(away.scale(14)).add(0, 12, 0);
    brain.teleport(to);
    brain.place(to, Brain.yawTo(to, tp));
    this.aura = brain.fx(this.auraModel(), to, 'start>loop', 1, 0).follow(brain.dragon, POSITION, 0);
    brain.sound(to, 'mob.enderdragon.growl', 8, 1.2);
    this.t = 0;
  }

  tick(brain: Brain): boolean {
    if (this.target === null) return true;
    this.t++;
    if (this.struck) return this.afterStrike(brain);
    const pos = brain.position();
    const aim = Brain.valid(this.target) ? Brain.mid(this.target) : pos.add(brain.forward().scale(10));
    const dir = aim.sub(pos);
    const step = Math.min(this.speed(), dir.length());
    let next = dir.lengthSqr() < 1e-4 ? pos : pos.add(dir.normalize().scale(step));
    const floor = brain.groundY(next.x, next.z) + 1;
    next = new V(next.x, Math.max(floor, next.y), next.z);
    brain.place(next, Brain.yawTo(pos, aim));
    this.aura?.yaw(-brain.yaw());
    if (this.t % 2 === 0) particle(PART.portal, next.add(0, 2, 0), 2, 2);
    const head = brain.head();
    const radius = C.RUSH_RADIUS;
    if ((Brain.valid(this.target) && head.distanceTo(Brain.mid(this.target)) <= radius) || this.t >= C.RUSH_MAX_TICKS) {
      this.strike(brain, head, radius);
      this.struck = true;
      this.t = 0;
    }
    return false;
  }

  protected strike(brain: Brain, head: V, radius: number): void {
    brain.sound(head, 'random.explode', 6, 0.8);
    brain.sound(head, 'mob.enderdragon.growl', 6, 0.9);
    particle(PART.explosion, head, 4, 1.5);
    brain.addWave(brain.ground(head), radius, 6, false);
    for (const e of brain.targetsNear(head, radius)) {
      if (this.hit.has(e.id)) continue;
      this.hit.add(e.id);
      brain.strike(e, DT.SLAM, C.RUSH_DAMAGE, V.of(e.location).sub(head), 1.6, 0.7);
    }
  }

  protected afterStrike(brain: Brain): boolean {
    if (this.t === 1 && this.aura) this.aura.anims('end').life(10);
    if (this.t < 6) {
      brain.place(brain.position().add(brain.forward().scale(this.speed() * 0.5)).add(0, 0.4, 0), brain.yaw());
      return false;
    }
    brain.launch(0.6);
    return true;
  }

  cancel(_brain: Brain): void {
    this.aura?.discard();
  }
}
