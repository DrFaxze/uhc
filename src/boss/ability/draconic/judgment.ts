import { C } from '../../../config';
import { DT } from '../../../core/damage';
import { COLORS, dust, groundAt, particle, PART } from '../../../core/world';
import type { Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import { V } from '../../../util/vec';
import type { Ability, Task } from '../../api';
import { groundRing, type Brain } from '../../brain';
import { centerPlayers, centerPull } from './centerUtil';

/** Altura de la caja de daño de la columna (JudgmentColumnEntity.BELOW / ABOVE). */
const BELOW = 10;
const ABOVE = 30;

function chargeTicks(isFinal: boolean): number {
  return isFinal ? C.FINAL_CHARGE : C.JUDGMENT_CHARGE;
}
function circleLift(isFinal: boolean): number {
  return isFinal ? 0 : C.JUDGMENT_CIRCLE_LIFT;
}

/**
 * Juicio (y Juicio final de la ira): columnas sobre los objetivos y puntos al azar alrededor del podio.
 * La habilidad termina al activarse; las columnas siguen (JudgmentColumns) como las entidades de Java.
 */
export class JudgmentAbility implements Ability {
  private ticks = 0;

  constructor(readonly final: boolean) {}

  start(brain: Brain): void {
    const podium = brain.center();
    const spots: V[] = [];
    const total = this.final ? C.FINAL_COUNT : C.JUDGMENT_COUNT;
    const targets = brain.targets();
    for (let i = 0; i < Math.min(2, total) && targets.length > 0; i++) {
      spots.push(V.of(targets.splice(rand.nextInt(targets.length), 1)[0].location));
    }
    let tries = 0;
    while (spots.length < total && tries++ < 60) {
      const angle = rand.nextDouble() * Math.PI * 2;
      const r = 8 + rand.nextDouble() * 72;
      const x = podium.x + Math.cos(angle) * r;
      const z = podium.z + Math.sin(angle) * r;
      const g = groundAt(x, z);
      if (g !== null) spots.push(new V(x, g, z));
    }
    brain.addTask(new JudgmentColumns(spots.map((s) => new Column(s, this.final))));
    brain.sound(brain.position(), 'mob.enderdragon.growl', 6, this.final ? 0.6 : 0.9);
  }

  tick(_brain: Brain): boolean {
    return ++this.ticks >= chargeTicks(this.final) + 10;
  }
}

/** JudgmentColumnEntity: círculo de carga, luego columna que daña por pulsos. */
class Column {
  private age = 0;
  private activeAge = 0;
  private circle: Effect | null = null;
  private column: Effect | null = null;
  done = false;

  constructor(
    readonly center: V,
    readonly isFinal: boolean,
  ) {}

  private radius(): number {
    return C.JUDGMENT_RADIUS;
  }

  tick(brain: Brain): void {
    if (this.done) return;
    if (this.column) this.activeAge++;
    this.age++;
    const isFinal = this.isFinal;
    const charge = chargeTicks(isFinal);
    const duration = C.JUDGMENT_DURATION;
    const radius = this.radius();
    const center = this.center;
    if (this.age <= charge) {
      if (this.age === 1) {
        this.circle = brain.fx(isFinal ? 'final_judgment_circle' : 'judgment_circle', center.add(0, circleLift(isFinal), 0), 'charge>spin|pulse', radius / 16, charge + duration + 2);
        brain.sound(center, 'beacon.ambient', 5, isFinal ? 0.5 : 0.8);
      }
      if (this.age % 5 === 1) groundRing(center.add(0, circleLift(isFinal), 0), radius, 48, isFinal ? COLORS.red : COLORS.purple);
      if (isFinal) this.pull(center, radius * 1.5);
      if (this.age === charge) {
        // En Java la columna existe desde el principio pero no se dibuja hasta activarse.
        this.column = brain.fx(isFinal ? 'final_judgment_column' : 'judgment_column', center, 'open>rise', radius / 16, duration + 1).scaleY(1);
        brain.sound(center, 'beacon.activate', 6, isFinal ? 0.5 : 0.9);
        particle(PART.explosion, center.add(0, 1, 0));
      }
      return;
    }
    const active = this.age - charge;
    if (active > duration) {
      this.remove();
      return;
    }
    if (this.activeAge === 9) this.column?.slot(1, 'pulse');
    if (active % 4 === 0) dust(center.add(0, 8, 0), isFinal ? COLORS.red : COLORS.purple, 6, new V(radius * 0.5, 8, radius * 0.5));
    if (isFinal) this.pull(center, radius * 1.5);
    if (!isFinal) {
      if (active % C.JUDGMENT_PERIOD === 0) this.damageRing(brain, center, 0, radius, C.JUDGMENT_DAMAGE);
    } else {
      if (active % C.FINAL_INNER_PERIOD === 0) this.damageRing(brain, center, 0, radius * 0.5, C.FINAL_INNER_DAMAGE);
      if (active % C.FINAL_OUTER_PERIOD === 0) this.damageRing(brain, center, radius * 0.5, radius, C.FINAL_OUTER_DAMAGE);
    }
  }

  /** Solo jugadores dentro del cilindro [minR, maxR] (de y-10 a y+30). */
  private damageRing(brain: Brain, center: V, minR: number, maxR: number, damage: number): void {
    for (const player of centerPlayers(center, maxR + ABOVE + BELOW)) {
      const y = player.location.y;
      if (y < center.y - BELOW || y > center.y + ABOVE) continue;
      const dx = player.location.x - center.x;
      const dz = player.location.z - center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= maxR * maxR && (minR <= 0 || d2 > minR * minR)) brain.strike(player, DT.JUDGMENT, damage);
    }
  }

  /** Atracción hacia el centro del Juicio final. Cada 2 ticks con el doble de fuerza (menos paquetes). */
  private pull(center: V, range: number): void {
    if (this.age % 2 !== 0) return;
    const strength = C.FINAL_PULL * 2;
    for (const player of centerPlayers(center, range)) {
      const dir = center.sub(player.location).flat();
      if (dir.lengthSqr() < 1) continue;
      const d = dir.normalize().scale(strength);
      centerPull(player, d.x, d.z);
    }
  }

  remove(): void {
    this.done = true;
    this.circle?.remove();
    this.column?.remove();
  }
}

/** Las columnas viven más que la habilidad: las mueve esta tarea. */
class JudgmentColumns implements Task {
  constructor(private readonly columns: Column[]) {}

  tick(brain: Brain): boolean {
    let any = false;
    for (const c of this.columns) {
      c.tick(brain);
      if (!c.done) any = true;
    }
    return !any;
  }

  cancel(_brain: Brain): void {
    for (const c of this.columns) c.remove();
  }
}
