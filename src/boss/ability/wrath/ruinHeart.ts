import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { COLORS, dust, particle, PART } from '../../../core/world';
import { POSITION, Target, type Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import type { Brain } from '../../brain';

/**
 * Corazón de la ruina (RuinHeartAbility): el dragón sube sobre el centro y deja un corazón golpeable que
 * lo hace inmune mientras carga. Si no se rompe con RUIN_HITS golpes, cae, cura al dragón y suelta un
 * pulso enorme.
 */
export class RuinHeartAbility implements Ability {
  private t = 0;
  private spot: V | null = null;

  start(brain: Brain): void {
    if (brain.hasTask((task) => task instanceof Heart)) {
      brain.replaceAbility('black_veil');
      return;
    }
    const h = C.RUIN_HEIGHT_MIN + rand.nextDouble() * Math.max(0, C.RUIN_HEIGHT_MAX - C.RUIN_HEIGHT_MIN);
    this.spot = brain.center().add(0, h, 0);
    this.t = 0;
  }

  tick(brain: Brain): boolean {
    if (!this.spot) return true;
    this.t++;
    const over = this.spot.add(0, 6, 0);
    brain.fly(over, 0.9, -1);
    if (brain.position().distanceTo(over) >= 10 && this.t <= 300) return false;
    brain.addTask(new Heart(brain, this.spot));
    return true;
  }
}

export class Heart implements Task {
  private readonly heart: Target;
  private readonly link: Effect;
  private readonly shield: Effect;
  private t = 0;
  private phase = 0;
  private cracks = 0;
  private seenHits = 0;
  private fallT = -1;
  private fallFrom: V | null = null;

  constructor(brain: Brain, at: V) {
    this.heart = Target.spawnCentered('ruin_heart', at, 'spawn>phase0|intact|loop', 2, 0);
    brain.adopt(this.heart);
    this.link = brain.fx('ruin_link', at, 'loop', 1, 0);
    this.shield = brain.fx('ruin_shield', brain.position(), 'start>loop', 1, 0).follow(brain.dragon, POSITION, 0);
    brain.sound(at, 'beacon.activate', 10, 0.5);
    brain.log(`corazon de la ruina en ${at}`);
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.fallT >= 0) return this.tickFall(brain);
    const charge = C.RUIN_CHARGE;
    brain.immuneFor(2);
    this.link.aimAt(brain.position().add(0, 2, 0));
    const hits = this.heart.hits();
    if (hits >= C.RUIN_HITS) {
      this.heart.slot(0, 'shatter').slot(1, '').life(16);
      this.heart.setInvulnerableNow(true);
      this.end();
      brain.sound(this.heart.position(), 'random.glass', 10, 0.4);
      brain.log('corazon de la ruina destruido');
      return true;
    }
    if (hits > this.seenHits) {
      this.seenHits = hits;
      const c = this.heart.center();
      dust(c, COLORS.red, 60, new V(3, 4, 3));
      particle(PART.crit, c, 5, 2.5);
      brain.sound(c, 'random.glass', 8, 0.5);
      brain.sound(c, 'break.amethyst_cluster', 8, 0.6);
    }
    const crack = Math.floor((hits * 4) / C.RUIN_HITS);
    if (crack !== this.cracks && crack >= 1 && crack <= 3) {
      this.cracks = crack;
      this.heart.slot(1, `crack${crack}`);
    }
    const want = Math.min(4, 1 + Math.floor((this.t * 4) / charge));
    if (want !== this.phase && this.t < charge) {
      this.phase = want;
      this.heart.slot(0, `phase${want}`);
      brain.sound(this.heart.position(), 'respawn_anchor.charge', 8, 0.5 + want * 0.1);
    }
    if (this.t % 20 === 0) {
      // Lágrimas de obsidiana de Java: polvo morado.
      dust(this.heart.position().add(0, 2, 0), COLORS.purple, 20, new V(1.5, 2, 1.5));
    }
    if (this.t >= charge) {
      this.heart.slot(0, 'fall');
      this.fallFrom = this.heart.center();
      this.fallT = 0;
      this.end();
    }
    return false;
  }

  private tickFall(brain: Brain): boolean {
    this.fallT++;
    const from = this.fallFrom!;
    const ground = brain.ground(from);
    const f = Math.min(1, this.fallT / 20);
    this.heart.moveCenter(from.lerp(ground.add(0, 16, 0), f * f));
    if (this.fallT !== 20) return false;
    brain.log('corazon de la ruina: pulso');
    this.heart.slot(0, 'shatter').life(16);
    const radius = C.RUIN_RADIUS;
    brain.fx('crimson_wave', ground.add(0, 0.3, 0), 'wave', Math.min(64, radius / 8), 32).scaleY(4);
    brain.sound(ground, 'random.explode', 12, 0.4);
    brain.sound(ground, 'mob.warden.sonic_boom', 12, 0.5);
    brain.heal(C.RUIN_HEAL);
    for (const e of brain.targetsNear(ground, radius)) {
      brain.strike(e, DT.RUIN_PULSE, C.RUIN_DAMAGE, V.of(e.location).sub(ground), 0.8, 0.4);
    }
    return true;
  }

  private end(): void {
    this.link.discard();
    this.shield.anims('end').life(10);
  }

  cancel(_brain: Brain): void {
    this.heart.discard();
    this.link.discard();
    this.shield.discard();
  }
}
