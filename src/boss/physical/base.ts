import { Entity } from '@minecraft/server';
import { dust, COLORS, particle, PART } from '../../core/world';
import type { Seat } from '../../fx/seat';
import { clamp, V, wrapDegrees } from '../../util/vec';
import { Brain, grabMouth } from '../brain';

/** Ataque físico (PhysicalAttack de Java). */
export abstract class PhysicalAttack {
  protected target!: Entity;
  protected t = 0;
  protected readonly hit = new Set<string>();
  protected seat: Seat | null = null;
  private brakeFrom = V.ZERO;
  private brakeVel = V.ZERO;
  private brakeTicks = 0;
  private braked = 0;

  abstract name(): string;
  abstract cooldown(): number;
  abstract score(brain: Brain, target: Entity): number;
  abstract tick(brain: Brain): boolean;

  start(brain: Brain, target: Entity): void {
    this.target = target;
    this.t = 0;
    brain.log(`físico: ${this.name()} contra ${target.typeId}`);
  }

  cancel(_brain: Brain): void {
    this.release();
  }

  staysAggressive(): boolean {
    return false;
  }

  chainNext(_brain: Brain): string | null {
    return null;
  }

  protected static turn(from: number, to: number, maxStep: number): number {
    return from + clamp(wrapDegrees(to - from), -maxStep, maxStep);
  }

  protected static flatDist(a: V, b: { x: number; z: number }): number {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
  }

  protected behind(brain: Brain, e: Entity): boolean {
    const to = V.of(e.location).sub(brain.position()).flat();
    return to.lengthSqr() > 0.001 && to.normalize().dot(brain.forward()) < -0.3;
  }

  protected beginBrake(brain: Brain, ticks: number): void {
    this.brakeFrom = brain.position();
    const v = brain.velocity();
    this.brakeVel = new V(v.x, 0, v.z);
    this.brakeTicks = ticks;
    this.braked = 0;
  }

  protected brakeStep(brain: Brain, faceYaw: number, turnStep: number): boolean {
    this.braked++;
    const f = 1 - this.braked / this.brakeTicks;
    this.brakeFrom = this.brakeFrom.add(this.brakeVel.scale(Math.max(0, f)));
    brain.place(this.brakeFrom, PhysicalAttack.turn(brain.yaw(), faceYaw, turnStep));
    return this.braked >= this.brakeTicks;
  }

  /** Golpes de la cola (partes 3, 4 y 5). */
  protected tailHits(brain: Brain, reach: number, onHit: (e: Entity) => void): void {
    const tail = [brain.part(3), brain.part(4), brain.part(5)];
    for (const e of brain.targets()) {
      for (const p of tail) {
        if (PhysicalAttack.flatDist(p, e.location) <= reach && Math.abs(p.y - e.location.y) <= 6) {
          if (!this.hit.has(e.id)) {
            this.hit.add(e.id);
            onHit(e);
          }
          break;
        }
      }
    }
  }

  protected static whiteBurst(_brain: Brain, at: V, n: number, spread: number): void {
    particle(PART.endRod, at, Math.ceil(n / 6), spread);
    dust(at, COLORS.white, n, new V(spread, spread * 0.6, spread), 0.15, 2);
  }

  protected static whiteRing(brain: Brain, at: V, radius: number): void {
    const n = Math.floor(Math.max(16, radius * 3));
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      const x = at.x + Math.cos(a) * radius * 0.6;
      const z = at.z + Math.sin(a) * radius * 0.6;
      dust(new V(x, brain.groundY(x, z) + 0.3, z), COLORS.white, 2, new V(0.3, 0.1, 0.3), 0.05, 2);
    }
  }

  protected holding(): boolean {
    return this.seat !== null && this.seat.valid && Brain.valid(this.target) && this.seat.carries(this.target);
  }

  protected grab(brain: Brain): void {
    const m = PhysicalAttack.mouth(brain);
    this.seat = brain.newSeat();
    this.seat.mount(this.target);
    brain.sound(m, 'mob.enderdragon.growl', 5, 0.5);
    brain.sound(m, 'mob.ravager.bite', 4, 0.5);
    brain.log(`${this.name()}: atrapa a ${this.target.typeId}`);
  }

  protected static mouth(brain: Brain): V {
    return grabMouth(brain);
  }

  protected moveSeat(brain: Brain): void {
    this.seat?.hold(PhysicalAttack.mouth(brain));
  }

  protected release(): void {
    if (this.seat) {
      this.seat.locked = false;
      this.seat.free();
      this.seat = null;
    }
  }
}
