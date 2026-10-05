import { system } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { COLORS, dust, end, forgetGround, groundAt, particle, PART, sound } from '../../../core/world';
import { ANY, Target, type Effect } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';
import { findSpikes, type Spike } from '../../flight';

/**
 * Curación: cuatro cristales carmesí alrededor del podio se llenan en HEAL_FILL_TICKS; cada uno se rompe
 * con HEAL_HITS golpes. Los que lleguen llenos curan; con los cuatro, además se regeneran los pilares.
 */
export class HealingAbility implements Ability {
  private readonly crystals: Target[] = [];
  private readonly beams: Effect[] = [];
  private readonly broken = [false, false, false, false];
  private readonly stage = [0, 0, 0, 0];
  private readonly seen = [0, 0, 0, 0];
  private t = 0;
  private failT = -1;

  start(brain: Brain): void {
    const c = brain.center().add(0, C.HEAL_HEIGHT, 0);
    const d = C.HEAL_DISTANCE;
    const offs = [new V(d, 0, 0), new V(-d, 0, 0), new V(0, 0, d), new V(0, 0, -d)];
    for (const o of offs) {
      const crystal = Target.spawnCentered('crimson_crystal', c.add(o), 'spawn>fill_0|intact|loop', 1, 0, ANY);
      brain.adopt(crystal);
      this.crystals.push(crystal);
      this.beams.push(brain.fx('heal_beam', crystal.center(), 'loop', 1, 0));
    }
    brain.sound(c, 'beacon.activate', 8, 1.2);
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.failT >= 0) return this.tickFail(brain);
    const body = brain.position().add(0, 2, 0);
    const fill = C.HEAL_FILL_TICKS;
    let alive = 0;
    for (let i = 0; i < 4; i++) {
      if (this.broken[i]) continue;
      const crystal = this.crystals[i];
      const hits = crystal.hits();
      if (hits >= C.HEAL_HITS) {
        this.broken[i] = true;
        crystal.slot(1, 'shatter').life(14);
        crystal.setInvulnerableNow(true);
        this.beams[i].discard();
        brain.sound(crystal.position(), 'random.glass', 6, 0.7);
        continue;
      }
      alive++;
      if (hits > this.seen[i]) {
        this.seen[i] = hits;
        const c = crystal.center();
        dust(c, COLORS.red, 40, new V(1.2, 1.8, 1.2));
        particle(PART.crit, c, 3, 1);
        brain.sound(c, 'random.glass', 6, 0.6 + hits * 0.2);
        if (hits === 1) crystal.slot(1, 'hit1');
        else if (hits === 2) crystal.slot(1, 'hit2');
      }
      this.beams[i].aimAt(body);
      const want = this.t >= fill ? 3 : this.t >= Math.floor((fill * 2) / 3) ? 2 : this.t >= Math.floor(fill / 3) ? 1 : 0;
      if (want !== this.stage[i]) {
        this.stage[i] = want;
        crystal.slot(0, want === 3 ? 'fill_100' : want === 2 ? 'fill_60' : 'fill_25');
        brain.sound(crystal.position(), 'block.amethyst_block.chime', 5, 0.8 + want * 0.2);
      }
    }
    if (alive === 0) {
      brain.log('curacion: destruidos los 4 cristales');
      for (let i = 0; i < 4; i++) {
        const at = this.crystals[i].center();
        this.beams[i] = brain.fx('heal_beam', body, 'reverse', 1, 30).aimAt(at);
      }
      this.failT = 0;
      return false;
    }
    if (this.t < fill) return false;
    let full = 0;
    for (let i = 0; i < 4; i++) {
      if (this.broken[i]) continue;
      full++;
      const c = this.crystals[i].center();
      brain.fx('heal_beam', c, 'loop', 2.5, 30).aimAt(body);
      particle(PART.endRod, c, 6, 1.2);
      particle(PART.explosion, c);
    }
    if (full > 0) brain.fx('heal_tally', brain.ground(brain.position()).add(0, 0.1, 0), `count${full}`, 1, 60);
    brain.heal(full * C.HEAL_PER_CRYSTAL);
    brain.log(`curacion: ${full} cristales llenos, +${full * C.HEAL_PER_CRYSTAL} PV`);
    if (full === 4) {
      brain.heal(C.HEAL_ALL_BONUS);
      brain.addTask(new HealingTask());
      brain.fx('shockwave_purple', brain.center().add(0, 0.3, 0), 'expand', 1, 32);
      brain.addWave(brain.center(), 40, 20, false);
    }
    brain.sound(body, 'beacon.power', 8, 0.8);
    this.cleanup();
    return true;
  }

  private tickFail(brain: Brain): boolean {
    this.failT++;
    if (this.failT !== 30) return false;
    const body = brain.position().add(0, 2, 0);
    brain.sound(body, 'random.explode', 8, 0.9);
    particle(PART.explosionEmitter, body);
    for (const e of brain.targetsNear(body, 10)) {
      brain.strike(e, DT.SHOCKWAVE, 2, V.of(e.location).sub(body), C.HEAL_FAIL_PUSH, 0.8);
    }
    this.cleanup();
    return true;
  }

  private cleanup(): void {
    for (const c of this.crystals) if (!c.isRemoved()) c.life(10);
    for (const b of this.beams) {
      if (b.length() > 0 && b.age > 1 && this.failT < 0) b.discard();
    }
  }

  cancel(_brain: Brain): void {
    for (const c of this.crystals) c.discard();
    for (const b of this.beams) b.discard();
  }
}

/**
 * Regenera los pilares sin cristal, uno cada HEALING_SPIKE_INTERVAL ticks. En Bedrock no se puede volver a
 * generar la estructura del pilar: se hace la explosión (sin romper bloques) y se pone un cristal del End
 * en lo alto.
 */
export class HealingTask implements Task {
  private spikes: Spike[] | null = null;
  private index = 0;
  private timer = 0;
  private firstDoneV = false;

  firstDone(): boolean {
    return this.firstDoneV;
  }

  tick(brain: Brain): boolean {
    if (this.spikes === null) {
      this.spikes = findSpikes(brain.center()).filter((s) => !hasCrystal(s));
      if (this.spikes.length === 0) {
        this.firstDoneV = true;
        return true;
      }
    }
    if (this.timer-- > 0) return false;
    this.timer = C.HEALING_SPIKE_INTERVAL;
    const spike = this.spikes[this.index++];
    forgetGround(spike.x, spike.z);
    const top = groundAt(spike.x, spike.z) ?? spike.top;
    const at = new V(spike.x + 0.5, top, spike.z + 0.5);
    try {
      end().createExplosion(at, 5, { breaksBlocks: false, causesFire: false });
    } catch {
      particle(PART.explosionEmitter, at);
    }
    // Un tick después, para que la explosión no lo rompa.
    system.runTimeout(() => {
      try {
        if (!hasCrystal(spike)) end().spawnEntity('minecraft:ender_crystal', at);
      } catch {
        /* fuera de carga */
      }
    }, 2);
    sound(at, 'beacon.activate', 6, 1.2);
    this.firstDoneV = true;
    return this.index >= this.spikes.length;
  }
}

/** ¿Hay un cristal del End en la columna del pilar? (EndSpike.getTopBoundingBox) */
function hasCrystal(s: Spike): boolean {
  try {
    const dim = end();
    const min = dim.heightRange.min;
    return (
      dim.getEntities({
        type: 'minecraft:ender_crystal',
        location: { x: s.x - s.radius, y: min, z: s.z - s.radius },
        volume: { x: s.radius * 2 + 1, y: dim.heightRange.max - min, z: s.radius * 2 + 1 },
      }).length > 0
    );
  } catch {
    return false;
  }
}
