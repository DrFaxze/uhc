// STUB: pendiente de portar
import type { Entity } from '@minecraft/server';
import type { Brain } from '../../brain';
import { PhysicalAttack } from '../base';

export class BloodthirstAttack extends PhysicalAttack {
  name(): string {
    return 'bloodthirst';
  }
  cooldown(): number {
    return 0;
  }
  score(_brain: Brain, _target: Entity): number {
    return 0;
  }
  tick(_brain: Brain): boolean {
    return true;
  }
}
