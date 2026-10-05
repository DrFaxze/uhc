import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { COLORS, dust, particle, PART } from '../../../core/world';
import { ANY, Target, type Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';
import { addVelocity, guardFall } from './flightUtil';

/**
 * Grietas (RiftsAbility): vuela en círculo a 24 bloques del centro dejando una grieta golpeable cada 2 s
 * (RIFT_COUNT_MIN..MAX). Cada grieta madura en 3 etapas de RIFT_STAGE_TICKS; si nadie la rompe antes, se abre
 * un agujero negro que atrae, hiere y al final colapsa.
 */
export class RiftsAbility implements Ability {
  private readonly rifts: Target[] = [];
  private t = 0;
  private angle = 0;
  private count = 0;

  start(brain: Brain): void {
    const min = C.RIFT_COUNT_MIN;
    this.count = min + rand.nextInt(Math.max(0, C.RIFT_COUNT_MAX - min) + 1);
    const rel = brain.position().sub(brain.center());
    this.angle = Math.atan2(rel.z, rel.x);
    brain.sound(brain.position(), 'mob.enderdragon.growl', 6, 0.7);
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.angle += 0.025;
    const c = brain.center();
    brain.fly(c.add(Math.cos(this.angle) * 24, 0, Math.sin(this.angle) * 24), 0.7, 12);
    const count = this.count > 0 ? this.count : C.RIFT_COUNT_MIN;
    if (this.t >= 40 && this.t % 40 === 0 && this.rifts.length < count) {
      const at = brain.position().sub(0, 4, 0);
      const rift = Target.spawnCentered('rift', at, 'form1', 1, 0, ANY);
      brain.sound(at, 'mob.endermen.portal', 3, 1.6);
      this.rifts.push(rift);
      brain.adopt(rift);
    }
    if (this.rifts.length >= count) {
      brain.addTask(new Rifts(this.rifts));
      return true;
    }
    return this.t > 400;
  }
}

/** Agujero negro (RiftsAbility.Hole). */
class Hole {
  readonly fx: Effect;
  private t = 0;

  constructor(brain: Brain, private readonly at: V) {
    this.fx = brain.fx('black_hole', at, 'open>loop', 1, 0);
    brain.sound(at, 'mob.warden.roar', 6, 0.5);
  }

  tick(brain: Brain): boolean {
    this.t++;
    const life = C.HOLE_TICKS;
    const radius = C.HOLE_RADIUS;
    const pull = C.HOLE_PULL;
    if (this.t <= life) {
      const nearest = brain.nearestTarget(this.at, 1000);
      for (const e of brain.targets()) {
        const d = Brain.mid(e).distanceTo(this.at);
        const inside = d <= radius;
        if (!inside && e.id !== nearest?.id) continue;
        const dir = this.at.sub(Brain.mid(e)).normalize();
        addVelocity(e, dir.x * pull, dir.y * pull + 0.02, dir.z * pull);
        guardFall(e);
        if (inside && this.t % 20 === 0) brain.strike(e, DT.BLACK_HOLE, C.HOLE_DAMAGE, V.ZERO, 0, 0);
      }
      if (this.t % 10 === 0) {
        particle(PART.portal, this.at, 6, radius * 0.5);
        dust(this.at, COLORS.purple, 20, new V(radius * 0.5, radius * 0.5, radius * 0.5), 0.4);
      }
      return false;
    }
    if (this.t === life + 1) {
      this.fx.anims('collapse').life(26);
      brain.sound(this.at, 'random.explode', 6, 0.4);
      for (const e of brain.targetsNear(this.at, radius)) {
        brain.strike(e, DT.RIFT_COLLAPSE, C.HOLE_COLLAPSE_DAMAGE, V.of(e.location).sub(this.at), 1, 0.5);
      }
    }
    return this.t > life + 26;
  }
}

/** Tarea que hace madurar las grietas y lleva los agujeros negros (RiftsAbility.Rifts). */
class Rifts implements Task {
  private readonly holes: Hole[] = [];
  private readonly ages: number[];
  private readonly done: boolean[];

  constructor(private readonly rifts: Target[]) {
    this.ages = rifts.map(() => 0);
    this.done = rifts.map(() => false);
  }

  tick(brain: Brain): boolean {
    const stage = C.RIFT_STAGE_TICKS;
    let busy = false;
    for (let i = 0; i < this.rifts.length; i++) {
      if (this.done[i]) continue;
      const rift = this.rifts[i];
      if (rift.isRemoved()) {
        this.done[i] = true;
        continue;
      }
      busy = true;
      const a = ++this.ages[i];
      if (rift.hits() >= C.RIFT_HITS) {
        rift.anims('hit>break').life(14);
        rift.setInvulnerableNow(true);
        brain.sound(rift.position(), 'random.glass', 4, 0.6);
        this.done[i] = true;
        continue;
      }
      if (a === stage) {
        rift.anims('form2');
      } else if (a === stage * 2) {
        rift.anims('form3');
      } else if (a === stage * 3) {
        rift.anims('loop');
        rift.life(2);
        this.done[i] = true;
        this.holes.push(new Hole(brain, rift.center()));
      }
      if (a % 20 === 0) particle(PART.reversePortal, rift.position().add(0, 1.5, 0), 4, 1);
    }
    for (let i = 0; i < this.holes.length; i++) {
      if (this.holes[i].tick(brain)) this.holes.splice(i--, 1);
    }
    return !busy && this.holes.length === 0;
  }

  cancel(_brain: Brain): void {
    for (const h of this.holes) h.fx.discard();
    for (const r of this.rifts) r.discard();
  }
}
