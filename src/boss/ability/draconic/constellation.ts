import { C } from '../../../config';
import { COLORS, dust, particle, PART } from '../../../core/world';
import { rand } from '../../../util/rand';
import { RAD, V } from '../../../util/vec';
import type { Ability } from '../../api';
import type { Brain } from '../../brain';
import { CenterCrystal, CORE, FEAR, NORMAL } from './centerUtil';
import { FearTask } from './fearTask';

const PREP = 40;

/**
 * Constelación: cristales sobre el dragón que lo curan mientras sigan en pie (Brain.tickConstellationHeal).
 * Con `fear` (Constelación del miedo, ira) además hay un núcleo que invoca withers y wardens (FearTask).
 */
export class ConstellationAbility implements Ability {
  private readonly points: V[] = [];
  private readonly placed: CenterCrystal[] = [];
  private ticks = 0;
  private pattern = '';

  constructor(readonly fear: boolean) {}

  damageTaken(): number {
    return this.fear ? 1 - C.FEAR_RESISTANCE : 1;
  }

  start(brain: Brain): void {
    const count = rand.roll(C.CONSTELLATION_MIN, C.CONSTELLATION_MAX);
    const base = brain.position().add(0, C.CONSTELLATION_HEIGHT, 0);
    this.points.push(...this.layout(count, base));
    brain.sound(brain.position(), 'beacon.activate', 6, this.fear ? 0.5 : 0.6);
    if (this.fear) brain.fx('fear_runes', brain.position().add(0, 0.2, 0), 'open>loop', 1, PREP + count + 40);
    brain.log(`constelacion${this.fear ? ' del miedo' : ''}: ${count} cristales en ${this.pattern}`);
  }

  tick(brain: Brain): boolean {
    this.ticks++;
    if (this.ticks <= PREP) {
      if (this.ticks % 5 === 0) {
        const pos = brain.position().add(0, 2, 0);
        dust(pos, this.fear ? COLORS.red : COLORS.pink, 30, new V(5, 3, 5));
        particle(PART.endRod, pos.add(0, 4, 0), 3, 4);
      }
      return false;
    }
    const i = this.placed.length;
    if (i < this.points.length) {
      const p = this.points[i];
      const crystal = new CenterCrystal(p, this.fear ? FEAR : NORMAL);
      brain.adopt(crystal);
      this.placed.push(crystal);
      const from = brain.position().add(0, 3, 0);
      brain.fx(this.fear ? 'fear_link' : 'heal_beam', from, 'loop', 1, 12).aimAt(p);
      dust(p.add(0, 1, 0), this.fear ? COLORS.red : COLORS.pink, 20, new V(1, 1, 1));
      brain.sound(p, 'block.amethyst_block.chime', 4, 0.8 + i * 0.03);
      return false;
    }
    if (this.fear) {
      let c = V.ZERO;
      for (const p of this.points) c = c.add(p);
      c = c.scale(1 / this.points.length).add(0, 2, 0);
      const core = new CenterCrystal(c, CORE);
      brain.adopt(core);
      brain.addTask(new FearTask(core, this.placed));
    }
    return true;
  }

  private layout(n: number, base: V): V[] {
    const s = C.CONSTELLATION_SPACING;
    const heading = rand.nextDouble() * Math.PI * 2;
    const f = new V(Math.cos(heading), 0, Math.sin(heading));
    const side = new V(-f.z, 0, f.x);
    const out: V[] = [];
    const kind = rand.nextInt(13);
    const half = n * s * 0.5;
    if (kind === 0) {
      this.pattern = 'zigzag';
      let cur = base.sub(f.scale(half * 0.8));
      for (let i = 0; i < n; i++) {
        out.push(cur);
        const turn = 60 * RAD * (i % 2 === 0 ? 1 : -1);
        const d = f.scale(Math.cos(turn)).add(side.scale(Math.sin(turn)));
        cur = cur.add(d.scale(s)).add(0, (rand.nextDouble() - 0.5) * 1.5, 0);
      }
    } else if (kind === 1) {
      this.pattern = 'espiral';
      let a = 0;
      let r = s;
      for (let i = 0; i < n; i++) {
        out.push(base.add(f.scale(Math.cos(a) * r)).add(side.scale(Math.sin(a) * r)));
        a += s / r;
        r += ((s * 0.35) / Math.max(1, a / (Math.PI * 2))) * 0.5 + 0.25;
      }
    } else if (kind === 2) {
      this.pattern = 'corona';
      const r = (n * s) / (Math.PI * 2);
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        out.push(base.add(f.scale(Math.cos(a) * r)).add(side.scale(Math.sin(a) * r)).add(0, i % 2 === 0 ? 3 : 0, 0));
      }
    } else if (kind <= 6) {
      const v = kind - 3;
      this.pattern = `serpiente ${v + 1}`;
      const amp = 3 + v * 2;
      const freq = 0.35 + v * 0.08;
      for (let i = 0; i < n; i++) {
        const x = -half * 0.9 + i * s * 0.9;
        out.push(base.add(f.scale(x)).add(side.scale(Math.sin(i * freq) * amp)).add(0, Math.cos(i * freq) * (v % 2 === 0 ? 0 : 2), 0));
      }
    } else if (kind <= 10) {
      const v = kind - 7;
      this.pattern = `ramas ${v + 1}`;
      const branches = 2 + v;
      // División entera como en Java.
      const trunk = Math.max(4, n - branches * Math.max(1, Math.trunc(Math.trunc(n / 2) / branches)));
      for (let i = 0; i < trunk; i++) out.push(base.add(f.scale(-trunk * s * 0.5 + i * s)));
      const perBranch = Math.max(1, Math.trunc((n - trunk) / branches));
      for (let b = 0; b < branches && out.length < n; b++) {
        const root = out[Math.min(trunk - 1, Math.trunc(((b + 1) * trunk) / (branches + 1)))];
        const sign = b % 2 === 0 ? 1 : -1;
        const dir = f.scale(0.5).add(side.scale(sign)).normalize();
        for (let k = 1; k <= perBranch && out.length < n; k++) out.push(root.add(dir.scale(k * s)).add(0, k * 0.6, 0));
      }
    } else {
      this.pattern = 'cruz quebrada';
      const arm = Math.max(2, Math.trunc(n / 4));
      const dirs = [f, f.scale(-1), side, side.scale(-1)];
      const halfArm = Math.trunc(arm / 2);
      for (let d = 0; d < 4; d++) {
        for (let k = 1; k <= arm && out.length < n; k++) {
          const bend = k > halfArm ? dirs[(d + 2) % 4].scale((k - halfArm) * 0.6 * s) : V.ZERO;
          out.push(base.add(dirs[d].scale(k * s)).add(bend));
        }
      }
    }
    while (out.length > n) out.pop();
    return out;
  }

  toString(): string {
    return this.pattern;
  }
}
