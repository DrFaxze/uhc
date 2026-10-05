// STUB: pendiente de portar
import { DEATH_HOOK } from '../boss/brain';

export function registerLastBreath(): void {
  DEATH_HOOK.begin = (b) => b.finishDeath();
}
export function tickLastBreath(): void {}
