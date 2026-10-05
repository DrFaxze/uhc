import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { ANY, Effect, MELEE, Target } from '../../../fx/effect';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { Brain } from '../../brain';

/**
 * Rito carmesí: 4 cristales en cruz se llenan en 3 etapas mientras el dragón resiste el daño; los que
 * sigan en pie al final lo curan y disparan proyectiles carmesí que persiguen a los jugadores.
 */
export class CrimsonRiteAbility implements Ability {
  private readonly crystals: Target[] = [];
  private readonly links: Effect[] = [];
  private broken: boolean[] = [];
  private t = 0;
  private stage = 0;

  damageTaken(): number {
    return 1 - C.RITE_RESISTANCE;
  }

  start(brain: Brain): void {
    const c = brain.center().add(0, C.HEAL_HEIGHT, 0);
    const d = C.HEAL_DISTANCE;
    for (const o of [new V(d, 0, 0), new V(-d, 0, 0), new V(0, 0, d), new V(0, 0, -d)]) {
      const crystal = Target.spawnCentered('rite_crystal', c.add(o), 'fill0|intact|loop', 1, 0, ANY);
      brain.adopt(crystal);
      this.crystals.push(crystal);
      this.links.push(brain.fx('rite_link', crystal.center(), 'loop', 1, 0));
    }
    this.broken = [false, false, false, false];
    brain.sound(c, 'beacon.activate', 8, 0.6);
  }

  tick(brain: Brain): boolean {
    this.t++;
    const fill = C.RITE_FILL_TICKS;
    const body = brain.position().add(0, 2, 0);
    const want = Math.min(3, Math.floor((this.t * 3) / fill));
    const stageUp = want !== this.stage;
    this.stage = want;
    let alive = 0;
    for (let i = 0; i < 4; i++) {
      if (this.broken[i]) continue;
      const crystal = this.crystals[i];
      if (crystal.hits() >= C.RITE_HITS) {
        this.broken[i] = true;
        crystal.slot(0, 'shatter').life(12);
        crystal.setInvulnerableNow(true);
        this.links[i].discard();
        brain.sound(crystal.position(), 'random.glass', 6, 0.8);
      } else {
        alive++;
        if (crystal.hits() === 1) crystal.slot(1, 'hit1');
        this.links[i].aimAt(body);
        if (stageUp) {
          crystal.slot(0, `fill${want}`);
          brain.sound(crystal.position(), 'respawn_anchor.charge', 5, 0.6 + want * 0.2);
        }
      }
    }
    if (alive === 0) {
      brain.log('rito carmesi: destruidos los 4');
      return true;
    }
    if (this.t < fill) return false;

    const active: Target[] = [];
    for (let i = 0; i < 4; i++) {
      if (!this.broken[i]) active.push(this.crystals[i]);
      this.links[i].discard();
    }
    const k = active.length;
    let projectiles = k;
    if (k === 4) {
      brain.heal(C.RITE_HEAL_4);
      projectiles = 3;
    } else if (k === 3) {
      brain.heal(C.RITE_HEAL_3);
      projectiles = 2;
    }
    brain.log(`rito carmesi: ${k} activos, ${projectiles} proyectiles`);
    const volley = new Volley();
    for (let i = 0; i < k; i++) {
      const crystal = active[i];
      crystal.slot(0, 'activate').life(14);
      crystal.setInvulnerableNow(true);
      if (i < projectiles) {
        const target = brain.randomTarget(brain.center(), C.RITE_RANGE);
        if (target) {
          const proj = Target.spawnCentered('rite_projectile', crystal.center(), 'fly', 1, 0, MELEE);
          brain.adopt(proj);
          volley.list.push({ entity: proj, target, age: 0, done: false, falling: false });
        }
      }
    }
    if (volley.list.length > 0) brain.addTask(volley);
    brain.sound(body, 'beacon.power', 8, 0.5);
    return true;
  }

  cancel(): void {
    for (const c of this.crystals) c.discard();
    for (const l of this.links) l.discard();
  }
}

interface Projectile {
  entity: Target;
  target: Entity;
  age: number;
  done: boolean;
  /** fallFrom != null de Java: dejó de perseguir y cae a plomo. */
  falling: boolean;
}

/** Proyectiles del rito: persiguen a su objetivo; si se cansan, caen y estallan en el suelo. */
class Volley implements Task {
  readonly list: Projectile[] = [];

  tick(brain: Brain): boolean {
    let any = false;
    for (const p of this.list) {
      if (p.done) continue;
      any = true;
      p.age++;
      if (p.entity.hits() > 0 || p.entity.isRemoved()) {
        p.entity.discard();
        brain.sound(p.entity.position(), 'random.glass', 5, 0.6);
        p.done = true;
        continue;
      }
      const pos = p.entity.center();
      if (p.falling) {
        const next = pos.add(0, -0.9, 0);
        const ground = brain.groundY(pos.x, pos.z);
        if (next.y <= ground) {
          const at = new V(pos.x, ground, pos.z);
          p.entity.discard();
          brain.fx('crimson_wave', at.add(0, 0.2, 0), 'wave', C.RITE_FALL_RADIUS / 8, 30);
          brain.sound(at, 'random.explode', 8, 0.6);
          for (const e of brain.targetsNear(at.add(0, 1, 0), C.RITE_FALL_RADIUS)) {
            brain.strike(e, DT.RITE, C.RITE_FALL_DAMAGE, V.of(e.location).sub(at), 1, 0.5);
          }
          p.done = true;
        } else {
          p.entity.moveCenter(next);
        }
      } else if (p.age <= C.RITE_CHASE_TICKS && Brain.valid(p.target)) {
        const d = Brain.mid(p.target).sub(pos);
        if (d.length() < 1.5) {
          p.entity.discard();
          brain.fx('crimson_wave', pos, 'wave', 0.4, 30);
          brain.sound(pos, 'random.explode', 6, 0.9);
          brain.strike(p.target, DT.RITE, C.RITE_DAMAGE, d, 0.6, 0.3);
          p.done = true;
        } else {
          p.entity.faceDir(d);
          p.entity.moveCenter(pos.add(d.normalize().scale(C.RITE_SPEED)));
        }
      } else {
        p.falling = true;
      }
    }
    return !any;
  }

  cancel(): void {
    for (const p of this.list) p.entity.discard();
  }
}
