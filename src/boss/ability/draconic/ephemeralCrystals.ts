import { C } from '../../../config';
import { end, NS } from '../../../core/world';
import { POSITION } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';

/**
 * Cristales efímeros (EphemeralCrystalsAbility): durante EPHEMERAL_DURATION ticks condensa un cristal del End
 * cada EPHEMERAL_INTERVAL sobre sí mismo (hasta EPHEMERAL_MAX). Son cristales reales: curan al dragón como los
 * de los pilares y se quedan hasta que los rompen. Si ya hay una tanda en curso, lanza el Velo del End.
 */
export class EphemeralCrystalsAbility implements Ability {
  start(brain: Brain): void {
    if (brain.hasTask((t) => t instanceof Batch)) brain.replaceAbility('end_veil');
    else brain.addTask(new Batch());
  }

  tick(_brain: Brain): boolean {
    return true;
  }
}

class Batch implements Task {
  private t = 0;
  private placed = 0;
  private pending = -1;

  tick(brain: Brain): boolean {
    this.t++;
    if (this.pending > 0 && --this.pending === 0) this.spawnCrystal(brain);
    if (this.pending <= 0 && this.placed < C.EPHEMERAL_MAX && this.t % C.EPHEMERAL_INTERVAL === 1 && !brain.sitting()) {
      brain.fx('crystal_condense', brain.position(), 'condense>burst', 1, 44).follow(brain.dragon, POSITION, 1);
      brain.sound(brain.position(), 'beacon.power', 5, 1.4);
      this.pending = 30;
    }
    return this.t >= C.EPHEMERAL_DURATION && this.pending <= 0;
  }

  private spawnCrystal(brain: Brain): void {
    const spread = C.EPHEMERAL_SPREAD;
    const pos = brain.position().add((rand.nextDouble() * 2 - 1) * spread, C.EPHEMERAL_HEIGHT, (rand.nextDouble() * 2 - 1) * spread);
    try {
      const crystal = end().spawnEntity('minecraft:ender_crystal', pos);
      crystal.addTag(`${NS}_ephemeral`);
    } catch {
      return;
    }
    brain.sound(pos, 'block.amethyst_block.chime', 5, 0.8);
    this.placed++;
    brain.log(`cristal efimero ${this.placed} en ${pos}`);
  }
}
