import { Player } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import type { Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';

/** Separación entre puntos del muro (Java). */
const SPACING = 2.5;
/**
 * En Bedrock cada modelo cubre GROUP puntos seguidos (escala GROUP a lo largo del muro, altura 1):
 * 80 puntos = 40 entidades. El daño se sigue calculando con los 80 puntos.
 */
const GROUP = 2;

/** Velo negro (BlackVeilAbility): un muro de oscuridad que crece por el suelo a través del objetivo. */
export class BlackVeilAbility implements Ability {
  start(brain: Brain): void {
    const target = brain.nearestTarget(brain.position(), 200);
    const from = brain.ground(brain.position());
    let dir = target === null ? brain.forward() : V.of(target.location).sub(from);
    dir = dir.flat();
    dir = dir.lengthSqr() < 0.001 ? brain.forward() : dir.normalize();
    const start = target === null ? from : brain.ground(V.of(target.location).sub(dir.scale(30)));
    brain.addTask(new Wall(start, dir));
  }

  tick(_brain: Brain): boolean {
    return true;
  }
}

class Wall implements Task {
  private readonly segments: { fx: Effect; born: number }[] = [];
  private readonly points: V[] = [];
  private readonly born: number[] = [];
  private readonly lastHit = new Map<string, number>();
  private t = 0;
  private readonly yawDeg: number;

  constructor(
    private readonly start: V,
    private readonly dir: V,
  ) {
    this.yawDeg = Math.atan2(dir.x, dir.z) * (180 / Math.PI) + 90;
  }

  tick(brain: Brain): boolean {
    this.t++;
    const total = C.BLACK_VEIL_POINTS;
    if (this.t % 4 === 0 && this.points.length < total) {
      const i = this.points.length;
      const p = brain.ground(this.start.add(this.dir.scale(i * SPACING)));
      this.points.push(p);
      this.born.push(this.t);
      if (i % GROUP === 0) {
        // Un modelo por grupo, centrado entre sus puntos.
        const n = Math.min(GROUP, total - i);
        const mid = brain.ground(this.start.add(this.dir.scale((i + (n - 1) / 2) * SPACING)));
        const fx = brain.fx('black_veil', mid, 'mark>rise>merge>loop', 1, 0).yaw(this.yawDeg).scale(n).scaleY(1);
        this.segments.push({ fx, born: this.t });
      }
    }
    const life = C.BLACK_VEIL_DURATION;
    let any = false;
    for (const seg of this.segments) {
      const age = this.t - seg.born;
      if (age === 28 + life) seg.fx.anims('fade').life(16);
      if (age < 28 + life + 16) any = true;
    }
    if (this.t % 2 === 0) this.damage(brain, life);
    return this.points.length >= total && !any;
  }

  private damage(brain: Brain, life: number): void {
    const above = C.BLACK_VEIL_ABOVE;
    const below = C.BLACK_VEIL_BELOW;
    for (const e of brain.targets()) {
      if (!(e instanceof Player)) continue;
      const last = this.lastHit.get(e.id);
      if (last !== undefined && this.t - last < C.BLACK_VEIL_COOLDOWN) continue;
      const pos = V.of(e.location);
      for (let i = 0; i < this.points.length; i++) {
        const age = this.t - this.born[i];
        if (age < 20 || age > 28 + life) continue;
        const rel = pos.sub(this.points[i]);
        const along = rel.x * this.dir.x + rel.z * this.dir.z;
        const across = rel.x * -this.dir.z + rel.z * this.dir.x;
        if (along >= -1.25 && along <= 1.25 && Math.abs(across) <= 0.8 && rel.y >= -below && rel.y <= above) {
          brain.strike(e, DT.BLACK_VEIL, C.BLACK_VEIL_DAMAGE);
          this.lastHit.set(e.id, this.t);
          break;
        }
      }
    }
  }

  cancel(_brain: Brain): void {
    for (const seg of this.segments) seg.fx.discard();
  }
}
