// STUB: pendiente de portar
import type { Ability } from '../../api';
import type { Brain } from '../../brain';

export class BlackVeilAbility implements Ability {
  start(_brain: Brain): void {}
  tick(_brain: Brain): boolean {
    return true;
  }
}
