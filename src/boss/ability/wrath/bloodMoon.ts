import { Player, type Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT, isBlocking, strike } from '../../../core/damage';
import { dust, type RGB } from '../../../core/world';
import { ANY, ARROWS, Effect, POSITION, Target } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';
import { bloodSky, tickBloodSky } from './bloodSky';

/** Polvo de sangre (DustParticleOptions 0.75, 0.02, 0.05). */
const BLOOD: RGB = [0.75, 0.02, 0.05];

type Step = 'BREAK' | 'BROKEN' | 'RISE' | 'NIGHT' | 'FINAL';

interface Patch {
  fx: Effect;
  at: V;
  age: number;
}

/**
 * Luna de sangre (especial de la fase 4): 35 s para romper la luna con flechas; si no, sube la noche roja
 * (lágrimas, charcos, rayo de la luna, regeneración) y termina con una onda carmesí.
 */
export class BloodMoonAbility implements Ability {
  private step: Step = 'BREAK';
  private t = 0;
  private hover = V.ZERO;
  private moonAt = V.ZERO;
  private moon: Target | null = null;
  private rise: Effect | null = null;
  /** El "tint" de Java: cielo rojo desde la subida hasta el final. */
  private sky = false;
  private light: Ability | null = null;
  private lightIn = 80;
  private cracks = 0;
  private readonly tearTimes: number[] = [];
  private readonly tears = new Tears();
  private patches: Patch[] = [];
  private readonly standing = new Map<string, number>();
  private rayTarget: Entity | null = null;
  private rayMark: Effect | null = null;
  private ray: Effect | null = null;
  private rayT = 0;

  start(brain: Brain): void {
    const c = brain.center();
    this.hover = c.add(18, 45, 0);
    this.moonAt = c.add(0, 55, -20);
    this.moon = Target.spawnCentered('blood_moon', this.moonAt, 'rise>idle', 1, 0, ARROWS);
    brain.adopt(this.moon);
    brain.sound(c, 'mob.wither.spawn', 10, 0.5);
    brain.log(`luna de sangre: ${Math.floor(C.BLOOD_BREAK_TICKS / 20)} s para romperla con ${C.BLOOD_BREAK_HITS} flechas`);
  }

  damageTaken(): number {
    return this.step === 'RISE' ? C.BLOOD_RISE_FACTOR : 1;
  }

  private go(s: Step): void {
    this.step = s;
    this.t = 0;
  }

  tick(brain: Brain): boolean {
    this.t++;
    brain.fly(this.hover, 0.8, -1);
    if (brain.position().distanceTo(this.hover) < 6) {
      const look = brain.nearestTarget(brain.position(), 200);
      brain.hold(look ? look.location : null, 2);
    }
    if (this.step !== 'FINAL' && this.step !== 'BROKEN') this.tickLight(brain);
    else this.stopLight(brain);
    // Niebla roja mientras existe el tinte (ClientFx: efecto "blood_rise").
    if (this.sky) tickBloodSky();

    switch (this.step) {
      case 'BREAK':
        this.tickBreak(brain);
        break;
      case 'BROKEN':
        if (this.t >= 60) {
          this.cleanup();
          return true;
        }
        break;
      case 'RISE':
        if (this.t % 10 === 0) {
          const c = brain.center();
          dust(c.add(0, 2, 0), BLOOD, 40, new V(30, 2, 30));
        }
        if (this.t >= C.BLOOD_RISE) {
          // En Java la subida se quita, pero el "tinte" sigue: la niebla se queda hasta el final.
          this.rise?.discard();
          this.rise = null;
          const n = rand.roll(C.BLOOD_TEARS_MIN, C.BLOOD_TEARS_MAX);
          const night = C.BLOOD_NIGHT;
          for (let i = 0; i < n; i++) this.tearTimes.push(20 + rand.nextInt(Math.max(1, night - 60)));
          this.go('NIGHT');
        }
        break;
      case 'NIGHT':
        this.night(brain);
        break;
      case 'FINAL':
        return this.finale(brain);
    }
    return false;
  }

  private tickBreak(brain: Brain): void {
    const moon = this.moon;
    if (!moon || moon.isRemoved()) {
      this.go('BROKEN');
      return;
    }
    const hits = moon.hits();
    const need = C.BLOOD_BREAK_HITS;
    if (hits >= need) {
      brain.log(`luna de sangre: rota con ${hits} flechas, cancelada`);
      moon.anims('crack_white>shatter').life(64);
      moon.setInvulnerableNow(true);
      brain.sound(this.moonAt, 'random.glass', 12, 0.4);
      brain.sound(this.moonAt, 'mob.wither.death', 8, 1.2);
      this.go('BROKEN');
      return;
    }
    const crack = Math.floor((hits * 3) / need);
    if (crack > this.cracks) {
      this.cracks = crack;
      moon.anims(crack === 1 ? 'crack_black' : 'crack_white');
      brain.sound(this.moonAt, 'random.glass', 10, 0.6);
    }
    if (this.t % 20 === 0) brain.sound(this.moonAt, 'mob.warden.heartbeat', 10, 0.5 + this.t / C.BLOOD_BREAK_TICKS);
    if (this.t >= C.BLOOD_BREAK_TICKS) {
      brain.log(`luna de sangre: no la rompieron (${hits} flechas), comienza`);
      moon.setInvulnerableNow(true);
      moon.anims('rise>idle');
      const c = brain.center();
      this.rise = brain.fx('blood_rise', c.add(0, 0.2, 0), 'rise', 4, 0);
      this.sky = true;
      bloodSky(true);
      brain.sound(c, 'mob.wither.break_block', 12, 0.4);
      this.go('RISE');
    }
  }

  private tickLight(brain: Brain): void {
    if (this.light) {
      if (this.light.tick(brain)) this.light = null;
    } else if (--this.lightIn <= 0) {
      this.lightIn = rand.roll(C.SPECIAL_LIGHT_MIN, C.SPECIAL_LIGHT_MAX);
      this.light = brain.lightAttack();
      this.light.start(brain);
    }
  }

  private night(brain: Brain): void {
    const length = C.BLOOD_NIGHT;
    if (this.t % C.BLOOD_REGEN_PERIOD === 0) {
      brain.heal(C.BLOOD_REGEN);
      dust(brain.position().add(0, 2, 0), BLOOD, 30, new V(3, 2, 3));
    }
    for (const at of this.tearTimes) if (at === this.t) this.dropTear(brain);
    if (this.t % C.BLOOD_PATCH_INTERVAL === 1) {
      for (const e of brain.targets()) {
        const g = brain.ground(e.location);
        this.patches.push({ fx: brain.fx('blood_mark', g.add(0, 0.05, 0), 'mark>loop', 0.6, 0), at: g, age: 0 });
      }
    }
    this.tears.tick(brain);
    this.tickPatches(brain);
    this.tickRay(brain);
    if (this.t >= length) {
      this.endRay();
      for (const p of this.patches) p.fx.anims('fade').life(10);
      this.patches = [];
      this.moon?.anims('crack_black>crack_white>shatter');
      brain.sound(this.moonAt, 'random.glass', 12, 0.4);
      brain.addTask(this.tears);
      this.go('FINAL');
    }
  }

  private dropTear(brain: Brain): void {
    const targets = brain.targets();
    let base: V;
    if (targets.length > 0 && rand.nextBoolean()) {
      base = V.of(targets[rand.nextInt(targets.length)].location);
    } else {
      const a = rand.nextDouble() * Math.PI * 2;
      const r = 6 + rand.nextDouble() * 45;
      base = brain.center().add(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
    const at = new V(base.x, brain.groundY(base.x, base.z) + 34, base.z);
    const tear = Target.spawnTarget('moon_tear', at, 'fall', 1, 0, ANY);
    this.tears.list.push({ e: tear, t: 0, stuck: false, done: false });
    brain.sound(at, 'block.amethyst_block.chime', 6, 0.5);
  }

  private tickPatches(brain: Brain): void {
    this.patches = this.patches.filter((p) => {
      if (++p.age >= C.BLOOD_PATCH_TICKS) {
        p.fx.anims('fade').life(10);
        return false;
      }
      return true;
    });
    const r = C.BLOOD_PATCH_RADIUS;
    for (const e of brain.targets()) {
      const pos = V.of(e.location);
      let inside = false;
      for (const p of this.patches) {
        if (pos.sub(p.at).horizontalDistance() <= r && Math.abs(pos.y - p.at.y) < 3) {
          inside = true;
          break;
        }
      }
      let stood = inside ? (this.standing.get(e.id) ?? 0) + 1 : 0;
      if (stood >= C.BLOOD_PATCH_STAND) {
        brain.strike(e, DT.BLOOD_MOON, C.BLOOD_PATCH_DAMAGE);
        dust(pos.add(0, 0.5, 0), BLOOD, 40, new V(1, 0.5, 1));
        stood = 0;
      }
      this.standing.set(e.id, stood);
    }
  }

  private tickRay(brain: Brain): void {
    const target = this.rayTarget;
    if (Brain.valid(target)) {
      this.rayT++;
      const mark = C.BLOOD_RAY_MARK;
      if (this.rayT < mark) return;
      const to = Brain.mid(target);
      if (this.rayT === mark) {
        this.ray = brain.fx('blood_line', this.moonAt, 'loop', 2, 0);
        brain.sound(this.moonAt, 'beacon.activate', 10, 0.5);
      }
      this.ray?.aimAt(to);
      if ((this.rayT - mark) % C.BLOOD_RAY_PERIOD === 0) {
        // El rayo sale de la luna: el escudo tiene que mirar hacia ella.
        const hit = strike(target, DT.BLOOD_MOON, C.BLOOD_RAY_DAMAGE, brain.dragon, V.ZERO, 0, 0, this.moonAt);
        dust(to, BLOOD, 20, new V(0.5, 0.8, 0.5));
        if (!hit && target instanceof Player && isBlocking(target, this.moonAt)) {
          brain.log(`luna de sangre: ${target.nameTag || target.typeId} bloquea el rayo`);
          brain.sound(to, 'item.shield.block', 8, 0.6);
          this.endRay();
          this.rayTarget = null;
        }
      }
    } else {
      this.endRay();
      this.rayTarget = brain.randomTarget(brain.center(), 160);
      if (this.rayTarget) {
        this.rayT = 0;
        this.rayMark = brain.fx('death_beam_mark', this.rayTarget.location, 'mark>loop', 0.6, 0).follow(this.rayTarget, POSITION, 0.05);
        brain.sound(this.rayTarget.location, 'mob.warden.heartbeat', 8, 0.6);
        brain.log(`luna de sangre: rayo sobre ${this.rayTarget.nameTag || this.rayTarget.typeId}`);
      }
    }
  }

  private endRay(): void {
    this.ray?.discard();
    this.ray = null;
    this.rayMark?.discard();
    this.rayMark = null;
  }

  private finale(brain: Brain): boolean {
    if (this.t === 24) {
      const c = brain.center();
      const radius = C.BLOOD_FINAL_RADIUS;
      brain.fx('crimson_wave', c.add(0, 0.3, 0), 'wave', radius / 8, 32).scaleY(3);
      brain.sound(c, 'random.explode', 12, 0.4);
      brain.sound(c, 'mob.warden.sonic_boom', 12, 0.4);
      for (const e of brain.targetsNear(c, radius)) {
        brain.strike(e, DT.BLOOD_MOON, C.BLOOD_FINAL_DAMAGE, V.of(e.location).sub(c), C.BLOOD_FINAL_PUSH_H, C.BLOOD_FINAL_PUSH_V);
      }
    }
    if (this.t >= 84) {
      this.cleanup();
      return true;
    }
    return false;
  }

  private cleanup(): void {
    if (this.moon && this.step !== 'BROKEN') this.moon.discard();
    this.rise?.discard();
    this.rise = null;
    this.sky = false;
    bloodSky(false);
  }

  private stopLight(brain: Brain): void {
    if (this.light) {
      this.light.cancel?.(brain);
      this.light = null;
    }
  }

  cancel(brain: Brain): void {
    this.stopLight(brain);
    this.endRay();
    this.moon?.discard();
    this.rise?.discard();
    this.rise = null;
    this.sky = false;
    bloodSky(false);
    for (const p of this.patches) p.fx.discard();
    this.patches = [];
    this.tears.cancel();
  }
}

interface Tear {
  e: Target;
  t: number;
  stuck: boolean;
  done: boolean;
}

/** Lágrimas de la luna: caen, se clavan y explotan; siguen como tarea tras la habilidad. */
class Tears implements Task {
  readonly list: Tear[] = [];

  tick(brain: Brain): boolean {
    let any = false;
    for (const tear of this.list) {
      if (tear.done) continue;
      if (tear.e.isRemoved()) {
        tear.done = true;
        continue;
      }
      any = true;
      tear.t++;
      if (tear.e.hits() > 0) {
        tear.e.anims('explode').life(10);
        tear.e.setInvulnerableNow(true);
        brain.sound(tear.e.position(), 'random.glass', 5, 1.2);
        tear.done = true;
        continue;
      }
      const p = tear.e.position();
      if (!tear.stuck) {
        const ground = brain.groundY(p.x, p.z);
        const next = p.add(0, -0.8, 0);
        let victim: Entity | null = null;
        for (const e of brain.targetsNear(next.add(0, 1, 0), 1.6)) {
          // targets() ya son jugadores o entidades con la etiqueta de objetivo.
          victim = e;
          break;
        }
        if (victim) {
          brain.strike(victim, DT.BLOOD_MOON, C.BLOOD_TEAR_HIT, V.ZERO, 0.4, 0.2);
          tear.e.anims('explode').life(10);
          tear.e.setInvulnerableNow(true);
          brain.sound(next, 'random.explode', 4, 1.3);
          tear.done = true;
        } else if (next.y <= ground) {
          tear.e.moveTo(new V(p.x, ground, p.z));
          tear.e.anims('stuck');
          tear.stuck = true;
          tear.t = 0;
          brain.sound(p, 'hit.amethyst_block', 4, 0.6);
        } else {
          tear.e.moveTo(next);
        }
      } else if (tear.t < C.BLOOD_TEAR_STUCK) {
        if (tear.t % 20 === 0) dust(p.add(0, 1.5, 0), BLOOD, 6, new V(0.4, 0.8, 0.4));
      } else {
        tear.e.anims('explode').life(10);
        tear.e.setInvulnerableNow(true);
        const at = tear.e.position();
        brain.sound(at, 'random.explode', 6, 1);
        for (const e of brain.targetsNear(at.add(0, 1, 0), C.BLOOD_TEAR_RADIUS)) {
          brain.strike(e, DT.BLOOD_MOON, C.BLOOD_TEAR_DAMAGE, V.of(e.location).sub(at), 0.6, 0.3);
        }
        tear.done = true;
      }
    }
    return !any;
  }

  cancel(): void {
    for (const tear of this.list) tear.e.discard();
  }
}
