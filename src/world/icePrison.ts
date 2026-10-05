import { Entity } from '@minecraft/server';
import { end, isAirAt, particle, PART, sound } from '../core/world';
import { V } from '../util/vec';

/** Prisión de hielo 4×4×4 alrededor del jugador (IcePrison de Java). */
export class IcePrison {
  private blocks: V[] = [];
  private ticksLeft: number;

  private constructor(ticks: number) {
    this.ticksLeft = ticks;
  }

  static place(target: Entity, ticks: number): IcePrison {
    const prison = new IcePrison(ticks);
    const base = V.of(target.location);
    const bx = Math.floor(base.x);
    const by = Math.floor(base.y);
    const bz = Math.floor(base.z);
    const dim = end();
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = 0; dy <= 3; dy++) {
        for (let dz = -1; dz <= 2; dz++) {
          const p = new V(bx + dx, by + dy, bz + dz);
          try {
            const b = dim.getBlock(p);
            if (b && (b.isAir || b.isLiquid)) {
              b.setType('minecraft:ice');
              prison.blocks.push(p);
            }
          } catch {
            /* fuera de carga */
          }
        }
      }
    }
    sound(base, 'random.glass', 3, 0.5);
    sound(base, 'block.powder_snow.place', 3, 0.6);
    return prison;
  }

  tick(): boolean {
    if (--this.ticksLeft > 0) return false;
    this.dissolve();
    return true;
  }

  dissolve(): void {
    const dim = end();
    let any = false;
    for (const p of this.blocks) {
      try {
        const b = dim.getBlock(p);
        if (b?.typeId === 'minecraft:ice') {
          b.setType('minecraft:air');
          particle(PART.snowflake, p.add(0.5, 0.5, 0.5));
          any = true;
        }
      } catch {
        /* ignorar */
      }
    }
    if (any && this.blocks.length > 0) sound(this.blocks[0], 'random.glass', 2, 0.8);
    this.blocks = [];
    void isAirAt;
  }
}
