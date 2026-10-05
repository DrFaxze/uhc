import type { Vector3 } from '@minecraft/server';

/** Vector inmutable (equivale a Vec3 de Java). */
export class V {
  static readonly ZERO = new V(0, 0, 0);
  constructor(readonly x: number, readonly y: number, readonly z: number) {}

  static of(v: Vector3): V {
    return v instanceof V ? v : new V(v.x, v.y, v.z);
  }
  add(x: number | Vector3, y = 0, z = 0): V {
    return typeof x === 'number' ? new V(this.x + x, this.y + y, this.z + z) : new V(this.x + x.x, this.y + x.y, this.z + x.z);
  }
  sub(x: number | Vector3, y = 0, z = 0): V {
    return typeof x === 'number' ? new V(this.x - x, this.y - y, this.z - z) : new V(this.x - x.x, this.y - x.y, this.z - x.z);
  }
  scale(k: number): V {
    return new V(this.x * k, this.y * k, this.z * k);
  }
  mul(x: number, y: number, z: number): V {
    return new V(this.x * x, this.y * y, this.z * z);
  }
  dot(o: Vector3): number {
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }
  cross(o: Vector3): V {
    return new V(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x);
  }
  lengthSqr(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  length(): number {
    return Math.sqrt(this.lengthSqr());
  }
  horizontalDistance(): number {
    return Math.sqrt(this.x * this.x + this.z * this.z);
  }
  horizontalDistanceSqr(): number {
    return this.x * this.x + this.z * this.z;
  }
  normalize(): V {
    const l = this.length();
    return l < 1e-4 ? V.ZERO : this.scale(1 / l);
  }
  distanceTo(o: Vector3): number {
    return Math.sqrt(this.distanceToSqr(o));
  }
  distanceToSqr(o: Vector3): number {
    const dx = this.x - o.x;
    const dy = this.y - o.y;
    const dz = this.z - o.z;
    return dx * dx + dy * dy + dz * dz;
  }
  flatDistanceTo(o: Vector3): number {
    return Math.hypot(this.x - o.x, this.z - o.z);
  }
  withY(y: number): V {
    return new V(this.x, y, this.z);
  }
  flat(): V {
    return new V(this.x, 0, this.z);
  }
  /** Gira alrededor del eje Y (radianes), como Vec3.yRot de Java. */
  yRot(rad: number): V {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new V(this.x * c + this.z * s, this.y, this.z * c - this.x * s);
  }
  /** Gira alrededor del eje X (radianes), como Vec3.xRot de Java. */
  xRot(rad: number): V {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return new V(this.x, this.y * c + this.z * s, this.z * c - this.y * s);
  }
  lerp(o: Vector3, t: number): V {
    return new V(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t, this.z + (o.z - this.z) * t);
  }
  toString(): string {
    return `(${this.x.toFixed(1)}, ${this.y.toFixed(1)}, ${this.z.toFixed(1)})`;
  }
}

export const v = (x: number, y: number, z: number): V => new V(x, y, z);

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Envuelve grados a [-180, 180) (Mth.wrapDegrees). */
export function wrapDegrees(a: number): number {
  let r = a % 360;
  if (r >= 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

/** Dirección horizontal del "yaw" con la convención del Ender Dragon (FlightController.forward de Java). */
export function forward(yaw: number): V {
  const r = yaw * RAD;
  return new V(Math.sin(r), 0, -Math.cos(r));
}

/** Yaw del dragón para mirar de from a to (DragonBrain.yawTo de Java). */
export function yawTo(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z)) * DEG;
}
