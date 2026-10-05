import { Entity } from '@minecraft/server';
import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { particle, PART } from '../../../core/world';
import { ARROWS, Target, type Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability } from '../../api';
import { Brain } from '../../brain';
import { centerRemoveEffect } from './centerUtil';

type Step = 'GO' | 'COUNTDOWN' | 'COLLAPSE' | 'HUNT' | 'END';

/**
 * Eclipse (especial de las fases 2 y 3): lunas alrededor del podio que solo se apagan con flechas. Cada
 * ECLIPSE_INTERVAL ticks se eclipsa una; al eclipsarse todas, el dragón desaparece y caza: HUNT_HITS_PER_MOON
 * golpes inesquivables por cada luna que siguiera activa. Si se apagan todas, el eclipse se interrumpe.
 */
export class EclipseAbility implements Ability {
  private step: Step = 'GO';
  private t = 0;
  private readonly moons: Target[] = [];
  private readonly broken: Effect[] = [];
  private dead: boolean[] = [];
  private eclipsed = 0;
  private hover = V.ZERO;
  private light: Ability | null = null;
  private lightIn = 0;
  private hitsLeft = 0;
  private dashT = 0;
  private hider: Effect | null = null;
  private hidden = false;
  private readonly blinded: Entity[] = [];

  start(brain: Brain): void {
    this.hover = brain.center().add(0, C.ECLIPSE_HEIGHT - 6, 0);
    brain.sound(brain.position(), 'mob.enderdragon.growl', 8, 0.5);
  }

  immune(): boolean {
    return this.step === 'GO' || this.step === 'COUNTDOWN';
  }

  private go(s: Step): void {
    this.step = s;
    this.t = 0;
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.step !== 'COUNTDOWN') this.stopLight(brain);
    switch (this.step) {
      case 'GO':
        brain.fly(this.hover, 1.0, -1);
        if (brain.position().distanceTo(this.hover) < 5 || this.t > 300) {
          this.spawnMoons(brain);
          this.go('COUNTDOWN');
        }
        break;
      case 'COUNTDOWN':
        this.countdown(brain);
        break;
      case 'COLLAPSE':
        brain.hold(null, 0);
        if (this.t >= 30) {
          this.cleanup();
          return true;
        }
        break;
      case 'HUNT':
        this.hunt(brain);
        break;
      case 'END':
        brain.hold(null, 0);
        return this.t >= 10;
    }
    return false;
  }

  private spawnMoons(brain: Brain): void {
    const n = C.ECLIPSE_MOONS;
    const r = C.ECLIPSE_RADIUS;
    const c = brain.center().add(0, C.ECLIPSE_HEIGHT, 0);
    this.dead = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      const p = c.add(Math.cos(a) * r, 0, Math.sin(a) * r);
      const moon = Target.spawnCentered('eclipse_moon', p, 'idle', 2, 0, ARROWS);
      brain.adopt(moon);
      this.moons.push(moon);
    }
    brain.sound(c, 'beacon.activate', 8, 0.5);
    this.lightIn = 60;
    brain.log(`eclipse: ${n} lunas`);
  }

  private alive(): number {
    return this.dead.filter((d) => !d).length;
  }

  private countdown(brain: Brain): void {
    if (brain.position().distanceTo(this.hover) > 6) {
      brain.fly(this.hover, 1.0, -1);
    } else {
      const look = brain.nearestTarget(brain.position(), 200);
      brain.hold(look ? look.location : null, 2);
    }
    for (let i = 0; i < this.moons.length; i++) {
      const moon = this.moons[i];
      if (!this.dead[i] && moon.hits() > 0) {
        this.dead[i] = true;
        moon.setInvulnerableNow(true);
        const center = moon.center();
        const at = moon.position();
        moon.discard();
        this.broken.push(brain.fx('eclipse_moon_broken', center, 'break>idle', 2, 0));
        brain.sound(at, 'random.glass', 6, 0.5);
        brain.log(`eclipse: luna ${i} desactivada (${this.alive()} quedan)`);
      }
    }
    if (this.alive() === 0) {
      brain.log('eclipse: interrumpido');
      for (const b of this.broken) b.anims('collapse').life(22);
      brain.sound(brain.center(), 'beacon.deactivate', 8, 0.5);
      this.go('COLLAPSE');
      return;
    }
    if (this.light) {
      if (this.light.tick(brain)) this.light = null;
    } else if (--this.lightIn <= 0) {
      this.lightIn = rand.roll(C.SPECIAL_LIGHT_MIN, C.SPECIAL_LIGHT_MAX);
      this.light = brain.lightAttack();
      this.light.start(brain);
    }
    const interval = C.ECLIPSE_INTERVAL;
    if (this.t % interval === 0 && this.eclipsed < this.moons.length) {
      const moon = this.moons[this.eclipsed];
      if (!this.dead[this.eclipsed]) moon.anims('eclipse');
      this.eclipsed++;
      const c = brain.center().add(0, 1, 0);
      brain.fx('eclipse_pulse', c, 'pulse', 3, 26);
      brain.sound(c, 'mob.warden.sonic_charge', 10, 0.5);
      brain.sound(c, 'mob.enderdragon.growl', 6, 0.4);
      brain.log(`eclipse: cuenta ${this.moons.length - this.eclipsed}`);
    }
    if (this.eclipsed >= this.moons.length && this.t % interval === Math.floor(interval / 2)) {
      this.stopLight(brain);
      const survivors = this.alive();
      this.hitsLeft = C.HUNT_HITS_PER_MOON * survivors;
      brain.log(`eclipse completado: ${survivors} lunas activas, caceria de ${this.hitsLeft} golpes`);
      for (const moon of this.moons) if (!moon.isRemoved()) moon.anims('eclipse').life(40);
      this.hider = brain.fx('eclipse_pulse', brain.position(), 'vortex_loop', 2, 0).follow(brain.dragon, 1, 0);
      brain.setHidden(true);
      this.hidden = true;
      brain.sound(brain.position(), 'mob.endermen.portal', 8, 0.4);
      this.dashT = -20;
      this.go('HUNT');
    }
  }

  private hunt(brain: Brain): void {
    this.dashT++;
    // Se aparta muy por encima del podio mientras caza oculto.
    brain.place(brain.center().add(0, 60, 0), brain.yaw());
    if (this.dashT < 0) return;
    const interval = C.HUNT_HIT_INTERVAL;
    if (this.dashT % interval !== 0) return;
    const targets = brain.targetsNear(brain.center(), 160);
    if (this.hitsLeft > 0 && targets.length > 0) {
      this.hitsLeft--;
      const blind = this.hitsLeft * interval + 40;
      for (const e of targets) {
        try {
          e.addEffect('darkness', blind, { amplifier: 0, showParticles: false });
          e.addEffect('blindness', blind, { amplifier: 0, showParticles: false });
        } catch {
          /* ignorar */
        }
        if (!this.blinded.includes(e)) this.blinded.push(e);
        this.hit(brain, e, interval);
      }
    } else {
      this.finishHunt(brain);
    }
  }

  private hit(brain: Brain, e: Entity, interval: number): void {
    const a = rand.nextDouble() * Math.PI * 2;
    const dir = new V(Math.cos(a), 0, Math.sin(a));
    const at = Brain.mid(e);
    const from = at.add(dir.scale(14)).add(0, 3, 0);
    const to = at.sub(dir.scale(14)).add(0, -1, 0);
    brain.fx('eclipse_dash', from, 'streak', 0.6, interval + 6).aimAt(to);
    brain.sound(at, 'mob.enderdragon.flap', 6, 1.6);
    brain.strike(e, DT.ECLIPSE_HUNT, C.HUNT_DAMAGE, to.sub(from), 1.4, 0.6);
    particle(PART.sonicBoom, at);
  }

  private unblind(): void {
    for (const e of this.blinded) {
      centerRemoveEffect(e, 'darkness');
      centerRemoveEffect(e, 'blindness');
    }
    this.blinded.length = 0;
  }

  private unhide(brain: Brain): void {
    this.hider?.discard();
    this.hider = null;
    if (this.hidden) {
      brain.setHidden(false);
      this.hidden = false;
    }
  }

  private finishHunt(brain: Brain): void {
    this.unblind();
    this.unhide(brain);
    const top = brain.center().add(0, C.HUNT_REAPPEAR_HEIGHT, 0);
    brain.teleport(top);
    brain.place(top, brain.yaw());
    brain.roar();
    this.cleanup();
    this.go('END');
  }

  private cleanup(): void {
    for (const moon of this.moons) moon.discard();
    for (const b of this.broken) if (!b.isRemoved() && this.step !== 'COLLAPSE') b.discard();
  }

  private stopLight(brain: Brain): void {
    if (this.light) {
      this.light.cancel?.(brain);
      this.light = null;
    }
  }

  cancel(brain: Brain): void {
    this.stopLight(brain);
    this.unblind();
    this.unhide(brain);
    this.cleanup();
    for (const b of this.broken) b.discard();
  }
}
