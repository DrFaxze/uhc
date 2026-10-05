import { C } from '../config';
import { end, groundAt } from '../core/world';
import { clamp, DEG, forward, RAD, V, wrapDegrees } from '../util/vec';

/** Pilar del End (EndSpike): centro, radio y altura. */
export interface Spike {
  x: number;
  z: number;
  radius: number;
  top: number;
}

/**
 * Movimiento del dragón. En Bedrock no hay fases vanilla que sustituir: el dragón se pilota por teleport con
 * la misma física que el EnderDragon de Java (aceleración hacia delante, giro limitado, amortiguación) y el
 * tope de velocidad / altura de FlightController.
 */
export class Flight {
  pos: V;
  vel = V.ZERO;
  yaw: number;
  /** Inercia de giro (yRotA de Java). */
  private yawA = 0;
  phaseTarget: V | null = null;
  private spikes: Spike[] | null = null;

  constructor(pos: V, yaw: number) {
    this.pos = pos;
    this.yaw = yaw;
  }

  clear(): void {
    this.phaseTarget = null;
  }

  /** FlightController.apply + EnderDragon.aiStep: vuela hacia `to`. */
  apply(to: V, speed: number, altitude: number, center: V, turnBoost: number): void {
    let flat = new V(to.x - center.x, 0, to.z - center.z);
    const arena = C.ARENA_RADIUS;
    if (flat.length() > arena) {
      flat = flat.normalize().scale(arena);
      to = new V(center.x + flat.x, to.y, center.z + flat.z);
    }
    to = this.avoidSpikes(this.pos, to);
    let wantY: number;
    if (altitude >= 0) {
      const fwd = forward(this.yaw);
      const ground = Math.max(
        groundY(this.pos.x, this.pos.z, center.y),
        groundY(this.pos.x + fwd.x * 6, this.pos.z + fwd.z * 6, center.y),
        groundY(to.x, to.z, center.y),
      );
      wantY = ground + altitude;
    } else {
      wantY = to.y;
    }
    this.phaseTarget = new V(to.x, wantY, to.z);
    this.steer(this.phaseTarget, turnBoost);
    // Tope de velocidad horizontal y velocidad vertical hacia la altura deseada (FlightController).
    const h = this.vel.horizontalDistance();
    const cap = Math.max(0.02, speed - 0.06);
    let sx = this.vel.x;
    let sz = this.vel.z;
    if (h > cap) {
      sx *= cap / h;
      sz *= cap / h;
    }
    const vy = clamp((wantY - this.pos.y) * 0.12, -0.4, 0.4);
    this.vel = new V(sx, vy, sz);
    this.pos = this.pos.add(this.vel);
  }

  /** Aceleración y giro del EnderDragon vanilla hacia un objetivo. */
  private steer(target: V, turnBoost: number): void {
    const dx = target.x - this.pos.x;
    let dy = target.y - this.pos.y;
    const dz = target.z - this.pos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const h = Math.sqrt(dx * dx + dz * dz);
    const maxY = 0.6;
    if (h > 0) dy = clamp(dy / h, -maxY, maxY);
    this.vel = this.vel.add(0, dy * 0.01, 0);
    this.yaw = wrapDegrees(this.yaw);
    const toTarget = new V(dx, target.y - this.pos.y, dz).normalize();
    const fwd = new V(Math.sin(this.yaw * RAD), this.vel.y, -Math.cos(this.yaw * RAD)).normalize();
    const align = Math.max((fwd.dot(toTarget) + 0.5) / 1.5, 0);
    if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
      const turn = clamp(wrapDegrees(180 - Math.atan2(dx, dz) * DEG - this.yaw), -50, 50);
      const hv = this.vel.horizontalDistance() + 1;
      const turnSpeed = (0.7 / Math.min(hv, 40) / hv) * turnBoost;
      this.yawA *= 0.8;
      this.yawA += turn * turnSpeed;
      this.yaw += this.yawA * 0.1;
    }
    const f19 = 2 / (distSq + 1);
    const accel = 0.06 * (align * f19 + (1 - f19));
    const f = forward(this.yaw);
    this.vel = this.vel.add(f.x * accel, 0, f.z * accel);
    const n = this.vel.normalize();
    const d = 0.8 + (0.15 * (n.dot(fwd) + 1)) / 2;
    this.vel = this.vel.mul(d, 0.91, d);
  }

  /** Coloca el dragón a mano (place de Java): sin velocidad. */
  place(p: V, yaw: number): void {
    this.pos = p;
    this.yaw = wrapDegrees(yaw);
    this.yawA = 0;
    this.vel = V.ZERO;
    this.phaseTarget = null;
  }

  /** Movimiento libre con la velocidad actual (launch). */
  coast(): void {
    this.pos = this.pos.add(this.vel);
    this.vel = this.vel.mul(0.98, 0.91, 0.98);
  }

  setSpikes(spikes: Spike[]): void {
    this.spikes = spikes;
  }

  private avoidSpikes(from: V, to: V): V {
    const spikes = this.spikes ?? [];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) return to;
    let hit: Spike | null = null;
    let best = Number.MAX_VALUE;
    for (const s of spikes) {
      if (from.y > s.top + 4) continue;
      const t = ((s.x + 0.5 - from.x) * dx + (s.z + 0.5 - from.z) * dz) / len2;
      if (t <= 0 || t >= 1) continue;
      const qx = from.x + dx * t - (s.x + 0.5);
      const qz = from.z + dz * t - (s.z + 0.5);
      const clear = s.radius + 7;
      if (qx * qx + qz * qz < clear * clear && t < best) {
        best = t;
        hit = s;
      }
    }
    if (!hit) return to;
    const len = Math.sqrt(len2);
    const px = -dz / len;
    const pz = dx / len;
    const cx = hit.x + 0.5;
    const cz = hit.z + 0.5;
    const side = (from.x + dx * best - cx) * px + (from.z + dz * best - cz) * pz >= 0 ? 1 : -1;
    const r = hit.radius + 10;
    return new V(cx + px * side * r, to.y, cz + pz * side * r);
  }
}

/** FlightController.groundY: suelo en x,z o `fallback` si no hay bloques. */
export function groundY(x: number, z: number, fallback: number): number {
  const g = groundAt(x, z, end());
  return g === null ? fallback : g;
}

/** Pilares del End: 10 posiciones en un círculo de 42 bloques (SpikeFeature). */
export function findSpikes(center: V): Spike[] {
  const out: Spike[] = [];
  for (let i = 0; i < 10; i++) {
    const a = 2 * (-Math.PI + (Math.PI / 10) * i);
    const x = Math.floor(42 * Math.cos(a));
    const z = Math.floor(42 * Math.sin(a));
    const top = groundAt(center.x + x, center.z + z, end()) ?? center.y + 40;
    out.push({ x: Math.floor(center.x) + x, z: Math.floor(center.z) + z, radius: 5, top });
  }
  return out;
}
