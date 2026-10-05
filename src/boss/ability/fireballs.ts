import { Entity, type Vector3 } from '@minecraft/server';
import { end, mid, sound } from '../../core/world';
import { V } from '../../util/vec';
import type { Ability } from '../api';
import type { Brain } from '../brain';

/** Dispara una bola de fuego de dragón desde `from` en la dirección `dir`. */
export function shootFireball(owner: Entity, from: Vector3, dir: Vector3, speed = 1.2): Entity | null {
  try {
    const d = V.of(dir).normalize();
    const ball = end().spawnEntity('minecraft:dragon_fireball', from);
    const proj = ball.getComponent('minecraft:projectile');
    if (proj) {
      proj.owner = owner;
      proj.shoot(d.scale(speed), { uncertainty: 0 });
    } else {
      ball.applyImpulse(d.scale(speed));
    }
    return ball;
  } catch {
    return null;
  }
}

/** FireballVolleyAbility: 3 bolas a objetivos al azar, una cada 8 ticks (ataque ligero de las especiales). */
export class FireballVolley implements Ability {
  private t = 0;
  private shot = 0;

  start(): void {
    this.t = 0;
    this.shot = 0;
  }

  tick(brain: Brain): boolean {
    if (this.t++ % 8 !== 0) return false;
    const target = brain.randomTarget(brain.position(), 150);
    if (target && this.shot < 3) {
      const head = brain.head().add(brain.forward().scale(2));
      const dir = mid(target).sub(head).normalize();
      shootFireball(brain.dragon, head, dir);
      sound(head, 'mob.enderdragon.flap', 5, 0.9);
      this.shot++;
      return false;
    }
    return true;
  }
}
