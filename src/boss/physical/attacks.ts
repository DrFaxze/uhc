import type { PhysicalAttack } from './base';
import { BiteAttack } from './draconic/bite';
import { BrakeSweepAttack } from './draconic/brakeSweep';
import { DiveBiteAttack } from './draconic/diveBite';
import { GrabAttack } from './draconic/grab';
import { TailWhipAttack } from './draconic/tailWhip';
import { WingSlamAttack } from './draconic/wingSlam';
import { BloodthirstAttack } from './wrath/bloodthirst';
import { MeteorBiteAttack } from './wrath/meteorBite';
import { SweepAttack } from './wrath/sweep';
import { VoraciousHuntAttack } from './wrath/voraciousHunt';

/** PhysicalAttacks.DRACONIC / WRATH de Java. */
export const DRACONIC_ATTACKS: Record<string, () => PhysicalAttack> = {
  bite: () => new BiteAttack(),
  tail_whip: () => new TailWhipAttack(),
  dive_bite: () => new DiveBiteAttack(),
  wing_slam: () => new WingSlamAttack(false),
  brake_sweep: () => new BrakeSweepAttack(false),
  grab: () => new GrabAttack(false),
};

export const WRATH_ATTACKS: Record<string, () => PhysicalAttack> = {
  voracious_hunt: () => new VoraciousHuntAttack(1),
  voracious_hunt_2: () => new VoraciousHuntAttack(2),
  voracious_hunt_3: () => new VoraciousHuntAttack(3),
  sweep: () => new SweepAttack(),
  meteor_bite: () => new MeteorBiteAttack(),
  wing_rupture: () => new WingSlamAttack(true),
  return_sweep: () => new BrakeSweepAttack(true),
  predator_ascent: () => new GrabAttack(true),
  bloodthirst: () => new BloodthirstAttack(),
};
