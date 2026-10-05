import { C } from '../../../config';
import { DT, strike } from '../../../core/damage';
import { COLORS, dust, end, particle, PART, sound, validPlayer } from '../../../core/world';
import type { Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';

/**
 * Velo del End (EndVeilAbility): una línea de VEIL_POINTS puntos que cruza al objetivo más cercano; el suelo
 * se marca 1 s y luego brota una columna de fuego del End por punto cada VEIL_INTERVAL ticks.
 */
export class EndVeilAbility implements Ability {
  start(brain: Brain): void {
    const target = brain.nearestTarget(brain.position(), 160);
    const from = brain.ground(brain.position());
    let dir = target === null ? brain.forward() : V.of(target.location).sub(from);
    dir = dir.flat();
    dir = dir.lengthSqr() < 0.001 ? brain.forward() : dir.normalize();
    const start = target === null ? from : brain.ground(V.of(target.location).sub(dir.scale(C.VEIL_SPACING * 8)));
    const points: V[] = [];
    for (let i = 0; i < C.VEIL_POINTS; i++) points.push(brain.ground(start.add(dir.scale(i * C.VEIL_SPACING))));
    brain.addTask(new Line(points));
  }

  tick(_brain: Brain): boolean {
    return true;
  }
}

class Line implements Task {
  private t = 0;
  private next = 0;

  constructor(private readonly points: V[]) {}

  tick(brain: Brain): boolean {
    this.t++;
    if (this.t > 20) {
      if ((this.t - 20) % C.VEIL_INTERVAL === 0 && this.next < this.points.length) {
        brain.addTask(new VeilFire(brain, this.points[this.next++]));
      }
      return this.next >= this.points.length;
    }
    if (this.t % 5 === 1) {
      for (const p of this.points) dust(p.add(0, 0.3, 0), COLORS.purple, 3, new V(0.4, 0.1, 0.4));
    }
    return false;
  }
}

/**
 * Columna de fuego del End (VeilFireEntity): un Effect 'veil_fire' y el daño lo hace el script. Cada 5 ticks
 * quema una vez a cada jugador dentro del cilindro (radio VEIL_RADIUS, alto VEIL_HEIGHT).
 */
class VeilFire implements Task {
  private age = 0;
  private readonly fx: Effect;
  private readonly hitPlayers = new Set<string>();

  constructor(brain: Brain, private readonly at: V) {
    this.fx = brain.fx('veil_fire', at, 'burst|smoke_rise', 1, 0);
  }

  tick(brain: Brain): boolean {
    this.age++;
    const c = this.at;
    if (this.age === 1) sound(c, 'mob.blaze.shoot', 3, 0.6);
    if (this.age % 5 === 1) {
      const r = C.VEIL_RADIUS;
      const h = C.VEIL_HEIGHT;
      for (const player of end().getPlayers({ location: c, maxDistance: r + h + 2 })) {
        if (!validPlayer(player) || this.hitPlayers.has(player.id)) continue;
        const p = player.location;
        // Caja del jugador (0,6 × 1,8) contra la caja de la columna.
        if (Math.abs(p.x - c.x) >= r + 0.3 || Math.abs(p.z - c.z) >= r + 0.3) continue;
        if (p.y >= c.y + h || p.y + 1.8 <= c.y - 0.5) continue;
        this.hitPlayers.add(player.id);
        if (strike(player, DT.VEIL_FIRE, C.VEIL_DAMAGE, brain.dragon, V.ZERO, 0, 0, c)) {
          try {
            player.setOnFire(C.VEIL_FIRE_SECONDS, true);
          } catch {
            /* ignorar */
          }
        }
      }
    }
    // Partículas de la columna (en Java las pone el cliente cada tick; aquí, menos para no saturar).
    if (this.age % 3 === 0) {
      const y = c.y + rand.nextDouble() * C.VEIL_HEIGHT;
      particle(PART.soulFire, new V(c.x + (rand.nextDouble() - 0.5) * 1.6, y, c.z + (rand.nextDouble() - 0.5) * 1.6));
      dust(c.add(0, C.VEIL_HEIGHT * 0.5, 0), COLORS.purple, 3, new V(1, C.VEIL_HEIGHT * 0.5, 1), 0.05);
    }
    if (this.age % 6 === 0) particle(PART.smoke, c.add(0, 0.2, 0));
    if (this.age > C.VEIL_COLUMN_TICKS || !this.fx.valid) {
      this.fx.discard();
      return true;
    }
    return false;
  }

  cancel(_brain: Brain): void {
    this.fx.discard();
  }
}
