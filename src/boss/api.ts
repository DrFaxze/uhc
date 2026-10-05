import type { Brain } from './brain';

/** Habilidad (Ability de Java): start una vez, tick devuelve true al terminar. */
export interface Ability {
  start(brain: Brain): void;
  tick(brain: Brain): boolean;
  cancel?(brain: Brain): void;
  /** El dragón no recibe daño mientras dura. */
  immune?(): boolean;
  /** Factor de daño recibido mientras dura (1 = normal). */
  damageTaken?(): number;
}

/** Tarea en segundo plano (Task de Java): sigue aunque termine la habilidad que la creó. */
export interface Task {
  tick(brain: Brain): boolean;
  cancel?(brain: Brain): void;
  damageTaken?(): number;
}

export type AbilityFactory = () => Ability;
