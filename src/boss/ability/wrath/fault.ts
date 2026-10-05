import { C } from '../../../config';
import { DT, push } from '../../../core/damage';
import type { Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { DEG, V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';

/** Falla: una grieta de 32 bloques se abre bajo un jugador, atrae hacia su eje y quema a quien la pisa. */
export class FaultAbility implements Ability {
  private t = 0;

  start(brain: Brain): void {
    const target = brain.randomTarget(brain.center(), 120);
    const mid = target ? brain.ground(target.location) : brain.center();
    const a = rand.nextDouble() * Math.PI;
    const dir = new V(Math.sin(a), 0, Math.cos(a));
    const start = brain.ground(mid.sub(dir.scale(16)));
    const fx = brain.fx('wrath_fault', start.add(0, 0.05, 0), 'warn>open>loop', 1, 0).yaw(Math.atan2(dir.x, dir.z) * DEG);
    brain.addTask(new Fault(fx, start, dir));
    brain.sound(mid, 'mob.enderdragon.growl', 6, 0.5);
  }

  tick(): boolean {
    return ++this.t >= 32;
  }
}

class Fault implements Task {
  private t = 0;

  constructor(
    private readonly fx: Effect,
    private readonly start: V,
    private readonly dir: V,
  ) {}

  tick(brain: Brain): boolean {
    this.t++;
    if (this.t === 20) brain.sound(this.start.add(this.dir.scale(16)), 'ambient.weather.thunder', 10, 0.4);
    const open = 32;
    const duration = C.FAULT_DURATION;
    if (this.t > open && this.t <= open + duration) {
      const width = C.FAULT_WIDTH;
      for (const e of brain.targets()) {
        const rel = V.of(e.location).sub(this.start);
        const along = rel.x * this.dir.x + rel.z * this.dir.z;
        if (along < -1 || along > 33 || Math.abs(rel.y) > 6) continue;
        const across = rel.x * -this.dir.z + rel.z * this.dir.x;
        const dist = Math.abs(across);
        if (dist <= 8) {
          const pull = C.FAULT_PULL * Math.sign(-across);
          push(e, -this.dir.z * pull, 0, this.dir.x * pull);
        }
        if (this.t % C.FAULT_PERIOD === 0) {
          if (dist <= width) brain.strike(e, DT.FAULT, C.FAULT_CENTER_DAMAGE);
          else if (dist <= width + 2.5) brain.strike(e, DT.FAULT, C.FAULT_EDGE_DAMAGE);
        }
      }
    }
    if (this.t === open + duration) this.fx.anims('close').life(22);
    return this.t > open + duration + 22;
  }

  cancel(): void {
    this.fx.discard();
  }
}
