// STUB: pendiente de portar
import type { Ability } from '../../api';
import type { Brain } from '../../brain';

export class ConstellationAbility implements Ability {
  constructor(readonly fear: boolean) {}

  start(_brain: Brain): void {}
  tick(_brain: Brain): boolean {
    return true;
  }
}
