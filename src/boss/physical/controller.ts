import { Entity } from '@minecraft/server';
import { C } from '../../config';
import { rand } from '../../util/rand';
import { V } from '../../util/vec';
import type { Brain } from '../brain';
import { DRACONIC_ATTACKS, WRATH_ATTACKS } from './attacks';
import type { PhysicalAttack } from './base';

type Mode = 'STALK' | 'ENGAGE' | 'RECOVER';

/** Estado físico: acecho, ataque y retirada (PhysicalController de Java). */
export class PhysicalController {
  private mode: Mode = 'STALK';
  private target: Entity | null = null;
  private attack: PhysicalAttack | null = null;
  private lastAttack: string | null = null;
  private cooldowns = new Map<string, number>();
  private globalCooldown = 0;
  private decideIn = 0;
  private orbitSign = 1;
  private orbitFlipIn = 120;
  private feintTicks = 0;
  private recoverPoint: V | null = null;
  private recoverTicks = 0;
  passedTicks = 0;

  constructor(private readonly brain: Brain) {}

  private kit(): Record<string, () => PhysicalAttack> {
    return this.brain.wrath() ? WRATH_ATTACKS : DRACONIC_ATTACKS;
  }

  begin(): void {
    this.mode = 'STALK';
    this.globalCooldown = 30;
    this.decideIn = 20;
  }

  end(): void {
    this.cancel();
  }

  cancel(): void {
    if (this.attack) {
      this.attack.cancel(this.brain);
      this.attack = null;
    }
  }

  attacking(): boolean {
    return this.attack !== null;
  }

  /** Devuelve true si está ocioso (el tiempo del estado corre). */
  tick(): boolean {
    if (this.globalCooldown > 0) this.globalCooldown--;
    if (this.passedTicks > 0) this.passedTicks--;
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, Math.max(0, v - 1));
    if (this.attack) {
      if (this.attack.tick(this.brain)) this.finishAttack();
      return false;
    }
    const targets = this.brain.targets();
    if (targets.length === 0) {
      this.target = null;
      const c = this.brain.center();
      const a = this.brain.age() * 0.012;
      this.brain.fly(c.add(Math.cos(a) * 32, 0, Math.sin(a) * 32), C.CRUISE_SPEED, C.CRUISE_ALTITUDE + 4);
      return true;
    }
    this.target = this.pickTarget(targets);
    if (this.mode === 'RECOVER') this.recover();
    else {
      this.mode = 'STALK';
      this.stalk();
    }
    return true;
  }

  private pickTarget(targets: Entity[]): Entity {
    let best = targets[0];
    let bestScore = -1;
    const pos = this.brain.position();
    for (const e of targets) {
      const d = pos.distanceTo(e.location);
      const s = 40 / (d + 4) + (e.id === this.target?.id ? 2 : 0) + rand.nextDouble() * 0.3;
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    return best;
  }

  groupCenter(around: Entity): V {
    let sum = V.ZERO;
    let n = 0;
    const a = V.of(around.location);
    for (const e of this.brain.targets()) {
      if (a.distanceToSqr(e.location) <= 64) {
        sum = sum.add(e.location);
        n++;
      }
    }
    return n === 0 ? a : sum.scale(1 / n);
  }

  groupSize(around: Entity, radius: number): number {
    const a = V.of(around.location);
    return this.brain.targets().filter((e) => a.distanceToSqr(e.location) <= radius * radius).length;
  }

  private stalk(): void {
    const t = this.target!;
    const c = this.groupCenter(t);
    const r = C.STALK_RADIUS;
    if (this.feintTicks <= 0) {
      if (--this.orbitFlipIn <= 0) {
        this.orbitFlipIn = 80 + rand.nextInt(100);
        this.orbitSign = -this.orbitSign;
      }
      const rel = this.brain.position().sub(c);
      const a = Math.atan2(rel.z, rel.x) + this.orbitSign * 0.6;
      this.brain.fly(c.add(Math.cos(a) * r, 0, Math.sin(a) * r), C.CRUISE_SPEED, C.CRUISE_ALTITUDE);
      if (this.globalCooldown <= 0 && --this.decideIn <= 0) {
        const wrath = this.brain.wrath();
        this.decideIn = wrath ? 4 + rand.nextInt(8) : 10 + rand.nextInt(20);
        if (rand.nextDouble() < C.FEINT_CHANCE * (wrath ? 0.5 : 1)) {
          this.feintTicks = 60;
          this.decideIn = 70;
        } else {
          this.chooseAttack(t);
        }
      }
    } else {
      this.feintTicks--;
      this.brain.fly(t.location, C.CHASE_SPEED, C.ATTACK_ALTITUDE + 1);
      if (this.brain.position().distanceToSqr(t.location) < 81 || this.feintTicks === 0) {
        this.feintTicks = 0;
        this.orbitSign = -this.orbitSign;
      }
    }
  }

  private chooseAttack(t: Entity): void {
    const scores: [string, number][] = [];
    let total = 0;
    for (const [name, factory] of Object.entries(this.kit())) {
      if ((this.cooldowns.get(name) ?? 0) <= 0 && name !== this.lastAttack) {
        let s = factory().score(this.brain, t);
        if (s > 0) {
          s *= 0.7 + rand.nextDouble() * 0.6;
          scores.push([name, s]);
          total += s;
        }
      }
    }
    if (scores.length === 0) {
      const recurrent = this.brain.wrath() ? 'voracious_hunt' : 'bite';
      if ((this.cooldowns.get(recurrent) ?? 0) === 0) this.start(recurrent, t);
      return;
    }
    let roll = rand.nextDouble() * total;
    for (const [name, s] of scores) {
      roll -= s;
      if (roll <= 0) {
        this.start(name, t);
        return;
      }
    }
  }

  start(name: string, t: Entity | null): boolean {
    const factory = DRACONIC_ATTACKS[name] ?? WRATH_ATTACKS[name];
    if (!factory || !t) return false;
    this.attack?.cancel(this.brain);
    this.target = t;
    this.attack = factory();
    this.attack.start(this.brain, t);
    this.mode = 'ENGAGE';
    return true;
  }

  private finishAttack(): void {
    const done = this.attack!;
    this.attack = null;
    this.cooldowns.set(done.name(), done.cooldown());
    this.lastAttack = done.name();
    const wrath = this.brain.wrath();
    const min = C.GLOBAL_COOLDOWN_MIN;
    const max = Math.max(min, C.GLOBAL_COOLDOWN_MAX);
    this.globalCooldown = wrath ? rand.nextInt(Math.max(1, min + 1)) : min + rand.nextInt(max - min + 1);
    this.decideIn = wrath ? 2 : 10;
    const next = done.chainNext(this.brain);
    const brakeName = wrath ? 'return_sweep' : 'brake_sweep';
    const brake = this.kit()[brakeName];
    const target = this.target;
    const valid = target !== null && this.brain.targets().some((e) => e.id === target.id);
    if (next !== null && valid) {
      this.brain.log(`físico: encadena ${next} tras ${done.name()}`);
      this.start(next, target);
    } else if (
      brake &&
      this.passedTicks > 0 &&
      valid &&
      brakeName !== done.name() &&
      (this.cooldowns.get(brakeName) ?? 0) === 0 &&
      brake().score(this.brain, target!) > 0 &&
      rand.nextDouble() < 0.7
    ) {
      this.brain.log(`físico: encadena la frenada tras ${done.name()}`);
      this.start(brakeName, target);
    } else if (!done.staysAggressive() && !wrath) {
      const from = target ? V.of(target.location) : this.brain.position();
      let away = this.brain.position().sub(from).flat();
      away = away.lengthSqr() < 0.001 ? this.brain.forward() : away.normalize();
      const turn = (rand.nextDouble() - 0.5) * ((120 * Math.PI) / 180);
      const dir = new V(away.x * Math.cos(turn) - away.z * Math.sin(turn), 0, away.x * Math.sin(turn) + away.z * Math.cos(turn));
      this.recoverPoint = from.add(dir.scale(24));
      this.recoverTicks = 50 + rand.nextInt(30);
      this.mode = 'RECOVER';
    } else {
      this.globalCooldown = Math.min(this.globalCooldown, 20);
      this.mode = 'STALK';
    }
  }

  private recover(): void {
    if (this.recoverPoint && --this.recoverTicks > 0 && this.brain.position().sub(this.recoverPoint).horizontalDistanceSqr() >= 16) {
      this.brain.fly(this.recoverPoint, C.CRUISE_SPEED, C.CRUISE_ALTITUDE + 2);
    } else {
      this.mode = 'STALK';
      this.decideIn = 10 + rand.nextInt(20);
      this.stalk();
    }
  }

  describe(): string {
    return this.mode + (this.attack ? `:${this.attack.name()}` : '');
  }
}
