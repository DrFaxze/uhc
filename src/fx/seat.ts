import { Entity, InputPermissionCategory, Player, system } from '@minecraft/server';
import { end, NS, SESSION } from '../core/world';
import { V } from '../util/vec';

const SEATS = new Set<Seat>();

/**
 * Asiento de agarre (GrabSeatEntity): el agarrado va montado en un asiento invisible que el dragón lleva en
 * la boca. Mientras no está "locked" se suelta agachándose (Bedrock desmonta con agacharse); cuando se
 * bloquea, se le quita el permiso de desmontar.
 */
export class Seat {
  readonly entity: Entity;
  private lockedV = false;
  private idle = 0;
  private empty = 0;
  private rider: Entity | null = null;
  private gone = false;

  private constructor(at: V) {
    this.entity = end().spawnEntity(`${NS}:grab_seat`, at);
    this.entity.setDynamicProperty('sid', SESSION);
    SEATS.add(this);
  }

  static create(at: V): Seat {
    return new Seat(at);
  }

  get locked(): boolean {
    return this.lockedV;
  }
  set locked(v: boolean) {
    this.lockedV = v;
    if (this.rider instanceof Player) setDismount(this.rider, !v);
  }

  get valid(): boolean {
    try {
      return !this.gone && this.entity.isValid;
    } catch {
      return false;
    }
  }
  isRemoved(): boolean {
    return !this.valid;
  }

  position(): V {
    try {
      return V.of(this.entity.location);
    } catch {
      return V.ZERO;
    }
  }

  /** Monta a `target` (startRiding forzado). */
  mount(target: Entity): boolean {
    try {
      const riding = target.getComponent('minecraft:riding');
      const vehicle = riding?.entityRidingOn;
      if (vehicle) vehicle.getComponent('minecraft:rideable')?.ejectRider(target);
      this.entity.teleport(this.entity.location);
      const ok = this.entity.getComponent('minecraft:rideable')?.addRider(target) ?? false;
      if (ok) this.rider = target;
      return ok;
    } catch {
      return false;
    }
  }

  /** ¿Sigue `target` montado en este asiento? (getVehicle() == seat) */
  carries(target: Entity | null | undefined): boolean {
    if (!target || !this.valid) return false;
    try {
      return target.getComponent('minecraft:riding')?.entityRidingOn?.id === this.entity.id;
    } catch {
      return false;
    }
  }

  hold(at: V): void {
    this.idle = 0;
    try {
      this.entity.teleport(at);
    } catch {
      /* fuera de carga */
    }
  }

  free(): void {
    this.lockedV = false;
    if (this.rider) {
      const r = this.rider;
      if (r instanceof Player) setDismount(r, true);
      try {
        if (this.entity.isValid) this.entity.getComponent('minecraft:rideable')?.ejectRider(r);
      } catch {
        /* ignorar */
      }
    }
    this.discard();
  }

  discard(): void {
    if (this.gone) return;
    if (this.rider instanceof Player) setDismount(this.rider, true);
    this.gone = true;
    SEATS.delete(this);
    try {
      if (this.entity.isValid) {
        const r = this.entity.getComponent('minecraft:rideable');
        for (const rider of r?.getRiders() ?? []) r?.ejectRider(rider);
        this.entity.remove();
      }
    } catch {
      /* ignorar */
    }
  }

  tick(): void {
    if (!this.valid) {
      this.discard();
      return;
    }
    let riders: Entity[] = [];
    try {
      riders = this.entity.getComponent('minecraft:rideable')?.getRiders() ?? [];
    } catch {
      riders = [];
    }
    if (riders.length === 0) {
      // Bloqueado: el jugador no puede desmontar; si aun así sale (muerte, desconexión) se suelta.
      if (++this.empty > 2) this.discard();
      return;
    }
    this.empty = 0;
    if (++this.idle > 40) this.free();
  }
}

function setDismount(p: Player, allowed: boolean): void {
  try {
    if (p.isValid) {
      p.inputPermissions.setPermissionCategory(InputPermissionCategory.Dismount, allowed);
    }
  } catch {
    /* ignorar */
  }
}

export function tickSeats(): void {
  for (const s of [...SEATS]) s.tick();
}

export function freeAllSeats(): void {
  for (const s of [...SEATS]) s.free();
}

/** Por si un jugador entra con el permiso de desmontar quitado de una sesión anterior. */
export function restoreDismount(p: Player): void {
  system.run(() => setDismount(p, true));
}
