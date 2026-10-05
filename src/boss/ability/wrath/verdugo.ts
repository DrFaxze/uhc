// STUB: pendiente de portar
import type { Ability } from '../../api';
import type { Brain } from '../../brain';

export class VerdugoAbility implements Ability {
  start(_brain: Brain): void {}
  tick(_brain: Brain): boolean {
    return true;
  }
}
