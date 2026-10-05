import { C } from '../../../config';
import { particle, PART } from '../../../core/world';
import { Target } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';
import { GHAST, riftPool, spawnRiftMob } from './riftMobs';

const VARIANTS = ['cave', 'plains', 'ocean', 'night_forest', 'crimson_forest', 'basalt_delta', 'soulsand_valley', 'end_city'];

/** Grietas dimensionales (DimRiftsAbility): grietas golpeables que, armadas, sueltan mobs de su bioma. */
export class DimRiftsAbility implements Ability {
  private rifts: Target[] = [];
  private variants: string[] = [];
  private t = 0;
  private count = 0;
  private angle = 0;
  private handed = false;

  start(brain: Brain): void {
    this.count = rand.roll(C.DIM_RIFT_MIN, C.DIM_RIFT_MAX);
    const rel = brain.position().sub(brain.center());
    this.angle = Math.atan2(rel.z, rel.x);
    brain.sound(brain.position(), 'mob.enderdragon.growl', 6, 0.6);
  }

  tick(brain: Brain): boolean {
    this.t++;
    this.angle += 0.03;
    const c = brain.center();
    brain.fly(c.add(Math.cos(this.angle) * 28, 0, Math.sin(this.angle) * 28), 0.8, 10);
    if (this.t >= 20 && this.t % 20 === 0 && this.rifts.length < this.count) {
      const v = VARIANTS[rand.nextInt(VARIANTS.length)];
      const at = brain.position().sub(0, 4, 0);
      const rift = Target.spawnCentered('dim_rift', at, `variant_${v}|form1`, 1, 0);
      brain.adopt(rift);
      this.rifts.push(rift);
      this.variants.push(v);
      brain.sound(at, 'block.end_portal.spawn', 3, 1.4);
    }
    if (this.rifts.length >= this.count) {
      this.handOver(brain);
      return true;
    }
    if (this.t > 600) {
      // Java termina sin pasar las grietas a la tarea; aquí se le pasan para que no queden congeladas.
      this.handOver(brain);
      return true;
    }
    return false;
  }

  private handOver(brain: Brain): void {
    if (this.handed || this.rifts.length === 0) return;
    this.handed = true;
    brain.addTask(new Rifts(this.rifts, this.variants));
  }

  cancel(_brain: Brain): void {
    if (this.handed) return;
    for (const r of this.rifts) r.discard();
  }
}

class Rifts implements Task {
  private readonly ages: number[];
  private readonly seenHits: number[];
  private readonly done: boolean[];

  constructor(
    private readonly rifts: Target[],
    private readonly variants: string[],
  ) {
    this.ages = rifts.map(() => 0);
    this.seenHits = rifts.map(() => 0);
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
      const form = a >= stage * 2 ? 'form3' : a >= stage ? 'form2' : 'form1';
      if (rift.hits() >= C.DIM_RIFT_HITS) {
        rift.slot(1, 'break').life(14);
        rift.setInvulnerableNow(true);
        brain.sound(rift.position(), 'random.glass', 4, 0.6);
        this.done[i] = true;
      } else if (rift.hits() !== this.seenHits[i]) {
        this.seenHits[i] = rift.hits();
        rift.slot(1, `hit>${form}`);
      } else if (a === stage || a === stage * 2) {
        rift.slot(1, form);
      } else if (a === stage * 3) {
        rift.slot(1, 'loop');
        this.spawnMobs(brain, rift.center(), this.variants[i]);
      } else if (a === stage * 3 + 60) {
        rift.slot(1, 'break').life(14);
        this.done[i] = true;
      }
    }
    return !busy;
  }

  private spawnMobs(brain: Brain, at: V, variant: string): void {
    const pool = riftPool(variant);
    brain.sound(at, 'block.end_portal.spawn', 6, 0.8);
    particle(PART.reversePortal, at.add(0, 1.5, 0), 12, 1.2);
    for (let k = 0; k < C.DIM_RIFT_MOBS; k++) {
      const type = pool[rand.nextInt(pool.length)];
      const p = brain.ground(at.add((rand.nextDouble() - 0.5) * 3, 0, (rand.nextDouble() - 0.5) * 3));
      const y = type === GHAST ? at.y + 2 : p.y;
      spawnRiftMob(type, new V(p.x, y, p.z), variant);
    }
    brain.log(`grieta dimensional ${variant}: mobs`);
  }

  cancel(_brain: Brain): void {
    for (const r of this.rifts) r.discard();
  }
}
