import { rand } from '../util/rand';
import type { Ability } from './api';
import { FireballVolley } from './ability/fireballs';
import { ConstellationAbility } from './ability/draconic/constellation';
import { EclipseAbility } from './ability/draconic/eclipse';
import { EndLightningAbility } from './ability/draconic/endLightning';
import { EndVeilAbility } from './ability/draconic/endVeil';
import { EnderbeamAbility } from './ability/draconic/enderbeam';
import { EphemeralCrystalsAbility } from './ability/draconic/ephemeralCrystals';
import { FractureAbility } from './ability/draconic/fracture';
import { FrostBulletsAbility } from './ability/draconic/frostBullets';
import { HealingAbility } from './ability/draconic/healing';
import { JudgmentAbility } from './ability/draconic/judgment';
import { RaptureAbility } from './ability/draconic/rapture';
import { RiftsAbility } from './ability/draconic/rifts';
import { RushAbility } from './ability/draconic/rush';
import { SonicRayAbility } from './ability/draconic/sonicRay';
import { BlackVeilAbility } from './ability/wrath/blackVeil';
import { BloodMoonAbility } from './ability/wrath/bloodMoon';
import { CrimsonRiteAbility } from './ability/wrath/crimsonRite';
import { DimRiftsAbility } from './ability/wrath/dimRifts';
import { FaultAbility } from './ability/wrath/fault';
import { FrostPrismAbility } from './ability/wrath/frostPrism';
import { RequiemAbility } from './ability/wrath/requiem';
import { RuinHeartAbility } from './ability/wrath/ruinHeart';
import { VerdugoAbility } from './ability/wrath/verdugo';
import { DRACONIC_ATTACKS, WRATH_ATTACKS } from './physical/attacks';

/** Abilities.ALL de Java. */
export const ALL: Record<string, () => Ability> = {
  rush: () => new RushAbility(false),
  enderbeam: () => new EnderbeamAbility(false),
  ephemeral_crystals: () => new EphemeralCrystalsAbility(),
  end_veil: () => new EndVeilAbility(),
  frost_bullets: () => new FrostBulletsAbility(),
  sonic_ray: () => new SonicRayAbility(),
  rifts: () => new RiftsAbility(),
  rapture: () => new RaptureAbility(false),
  eclipse: () => new EclipseAbility(),
  judgment: () => new JudgmentAbility(false),
  healing: () => new HealingAbility(),
  constellation: () => new ConstellationAbility(false),
  end_lightning: () => new EndLightningAbility(false),
  fracture: () => new FractureAbility(),
  verdugo: () => new VerdugoAbility(),
  death_beam: () => new EnderbeamAbility(true),
  ruin_heart: () => new RuinHeartAbility(),
  black_veil: () => new BlackVeilAbility(),
  frost_prism: () => new FrostPrismAbility(),
  requiem: () => new RequiemAbility(),
  dim_rifts: () => new DimRiftsAbility(),
  mortal_ascent: () => new RaptureAbility(true),
  blood_moon: () => new BloodMoonAbility(),
  final_judgment: () => new JudgmentAbility(true),
  crimson_rite: () => new CrimsonRiteAbility(),
  fear_constellation: () => new ConstellationAbility(true),
  intercept_cross: () => new EndLightningAbility(true),
  fault: () => new FaultAbility(),
  fireballs: () => new FireballVolley(),
};

export const DRACONIC_FLIGHT = ['rush', 'enderbeam', 'ephemeral_crystals', 'end_veil', 'frost_bullets', 'sonic_ray', 'rifts', 'rapture'];
export const DRACONIC_CENTER = ['judgment', 'healing', 'constellation', 'end_lightning', 'fracture'];
export const WRATH_FLIGHT = ['verdugo', 'death_beam', 'ruin_heart', 'black_veil', 'frost_prism', 'requiem', 'dim_rifts', 'mortal_ascent'];
export const WRATH_CENTER = ['final_judgment', 'crimson_rite', 'fear_constellation', 'intercept_cross', 'fault'];

export function createAbility(id: string): Ability | null {
  const f = ALL[id];
  return f ? f() : null;
}

/** Todo lo que acepta /improvedragon:cast. */
export function castable(): string[] {
  return [...Object.keys(ALL), ...Object.keys(DRACONIC_ATTACKS), ...Object.keys(WRATH_ATTACKS)];
}

/** Abilities.pick: elección por pesos sin repetir la anterior. */
export function pick(kit: string[], last: string | null, weights: Record<string, number> | null): string {
  let total = 0;
  const w: [string, number][] = [];
  for (const id of kit) {
    if (id !== last || kit.length <= 1) {
      const v = weights === null ? 1 : (weights[id] ?? 1);
      if (v > 0) {
        w.push([id, v]);
        total += v;
      }
    }
  }
  if (w.length === 0) return kit[rand.nextInt(kit.length)];
  let roll = rand.nextDouble() * total;
  for (const [id, v] of w) {
    roll -= v;
    if (roll <= 0) return id;
  }
  return w[0][0];
}

export function parseWeights(spec: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of spec.split(',')) {
    const kv = part.trim().split('=');
    if (kv.length === 2) {
      const n = Number(kv[1].trim());
      if (!Number.isNaN(n)) out[kv[0].trim()] = n;
    }
  }
  return out;
}
