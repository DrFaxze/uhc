import type { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { alive, particle, PART } from '../../../core/world';
import { POSITION, type Effect } from '../../../fx/effect';
import type { Seat } from '../../../fx/seat';
import { clamp, V } from '../../../util/vec';
import type { Ability } from '../../api';
import { Brain, grabMouth } from '../../brain';

/**
 * Verdugo (VerdugoAbility, que en Java hereda de RushAbility(true)): la Embestida de la ira. Si el golpe
 * alcanza al objetivo, lo agarra con la boca; si no se suelta en VERDUGO_ESCAPE ticks, lo lanza al cielo.
 * La parte de la Embestida va copiada aquí para no depender del port de rush.ts.
 */
export class VerdugoAbility implements Ability {
  private target: Entity | null = null;
  private aura: Effect | null = null;
  private t = 0;
  private struck = false;
  private readonly hit = new Set<string>();
  private victim: Entity | null = null;
  private seat: Seat | null = null;
  private bind: Effect | null = null;
  private holdT = 0;

  private speed(): number {
    return C.VERDUGO_SPEED;
  }

  start(brain: Brain): void {
    this.target = brain.nearestTarget(brain.position(), C.RUSH_RANGE);
    if (!this.target) {
      brain.replaceAbility('death_beam');
      return;
    }
    const tp = V.of(this.target.location);
    let away = brain.position().sub(tp).flat();
    away = away.lengthSqr() < 1 ? new V(1, 0, 0) : away.normalize();
    const to = tp.add(away.scale(14)).add(0, 12, 0);
    brain.teleport(to);
    brain.place(to, Brain.yawTo(to, tp));
    this.aura = brain.fx('verdugo_aura', to, 'start>loop', 1, 0).follow(brain.dragon, POSITION, 0);
    brain.sound(to, 'mob.enderdragon.growl', 8, 1.2);
    this.t = 0;
  }

  tick(brain: Brain): boolean {
    if (!this.target) return true;
    this.t++;
    if (this.struck) return this.afterStrike(brain);
    const pos = brain.position();
    const aim = Brain.valid(this.target) ? Brain.mid(this.target) : pos.add(brain.forward().scale(10));
    const dir = aim.sub(pos);
    const step = Math.min(this.speed(), dir.length());
    let next = dir.lengthSqr() < 1e-4 ? pos : pos.add(dir.normalize().scale(step));
    const floor = brain.groundY(next.x, next.z) + 1;
    next = new V(next.x, Math.max(floor, next.y), next.z);
    brain.place(next, Brain.yawTo(pos, aim));
    this.aura?.yaw(-brain.yaw());
    particle(PART.portal, next.add(0, 2, 0), 2, 2);
    const head = brain.head();
    const radius = C.RUSH_RADIUS;
    if ((Brain.valid(this.target) && head.distanceTo(Brain.mid(this.target)) <= radius) || this.t >= C.RUSH_MAX_TICKS) {
      this.strike(brain, head, radius);
      this.struck = true;
      this.t = 0;
    }
    return false;
  }

  private strike(brain: Brain, head: V, radius: number): void {
    brain.sound(head, 'game.player.attack.strong', 8, 0.5);
    brain.sound(head, 'mob.enderdragon.growl', 6, 0.6);
    brain.fx('verdugo_strike', head, 'hit', 1.5, 10).faceDir(brain.forward());
    for (const e of brain.targetsNear(head, radius)) {
      if (this.hit.has(e.id)) continue;
      this.hit.add(e.id);
      if (brain.strike(e, DT.SLAM, C.VERDUGO_DAMAGE, V.of(e.location).sub(head), 0.1, 0.05) && this.victim === null && e.id === this.target?.id && !riding(e)) {
        this.victim = e;
      }
    }
    if (this.victim) {
      this.seat = brain.newSeat();
      this.seat.mount(this.victim);
      this.bind = brain.fx('verdugo_bind', this.victim.location, 'bind>loop|count3', 1, 0).follow(this.victim, POSITION, 0);
      brain.log(`verdugo: agarra a ${name(this.victim)}`);
    }
  }

  private afterStrike(brain: Brain): boolean {
    if (!this.victim) {
      // RushAbility.afterStrike
      if (this.t === 1 && this.aura) this.aura.anims('end').life(10);
      if (this.t < 6) {
        brain.place(brain.position().add(brain.forward().scale(this.speed() * 0.5)).add(0, 0.4, 0), brain.yaw());
        return false;
      }
      brain.launch(0.6);
      return true;
    }
    if (this.aura && this.holdT === 0) this.aura.anims('end').life(10);
    this.holdT++;
    brain.hold(null, 0);
    const held = this.seat !== null && this.seat.valid && this.seat.carries(this.victim) && alive(this.victim);
    if (!held) {
      brain.log(`verdugo: ${name(this.victim)} se ha soltado`);
      this.releaseSeat();
      brain.launch(0.5);
      return true;
    }
    const m = grabMouth(brain);
    this.seat!.hold(m);
    const escape = C.VERDUGO_ESCAPE;
    const left = escape - this.holdT;
    if (this.bind && left % 20 === 0) this.bind.slot(1, `count${clamp(Math.floor(left / 20), 0, 3)}`);
    if (this.holdT >= escape) {
      const v = this.victim;
      this.releaseSeat();
      brain.sound(m, 'mob.enderdragon.growl', 8, 0.5);
      brain.launchUp(v, C.VERDUGO_LAUNCH);
      brain.log(`verdugo: lanza a ${name(v)}`);
      brain.launch(0.5);
      return true;
    }
    return false;
  }

  private releaseSeat(): void {
    if (this.bind) {
      this.bind.anims('release').life(8);
      this.bind = null;
    }
    if (this.seat) {
      this.seat.free();
      this.seat = null;
    }
  }

  cancel(_brain: Brain): void {
    this.aura?.discard();
    this.releaseSeat();
  }
}

function riding(e: Entity): boolean {
  try {
    return e.getComponent('minecraft:riding')?.entityRidingOn !== undefined;
  } catch {
    return false;
  }
}

function name(e: Entity): string {
  try {
    return e.nameTag || e.typeId;
  } catch {
    return '?';
  }
}
