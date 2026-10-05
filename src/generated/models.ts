// Generado por tools/gen.mjs: no editar a mano.
export interface ModelInfo { anims: string[]; lengths: number[]; loops: boolean[]; additive: boolean; target: [number, number] | null }
export const MODELS: Record<string, ModelInfo> = {
 "black_hole": {
  "anims": [
   "open",
   "loop",
   "collapse"
  ],
  "lengths": [
   20,
   60,
   24
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "black_veil": {
  "anims": [
   "mark",
   "rise",
   "merge",
   "loop",
   "fade"
  ],
  "lengths": [
   12,
   8,
   8,
   24,
   16
  ],
  "loops": [
   false,
   false,
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "blood_line": {
  "anims": [
   "loop"
  ],
  "lengths": [
   12
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "blood_mark": {
  "anims": [
   "mark",
   "loop",
   "fade"
  ],
  "lengths": [
   10,
   20,
   10
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "blood_moon": {
  "anims": [
   "rise",
   "idle",
   "eclipse",
   "eclipse_end",
   "crack_black",
   "crack_white",
   "shatter"
  ],
  "lengths": [
   120,
   80,
   30,
   20,
   12,
   12,
   60
  ],
  "loops": [
   false,
   true,
   false,
   false,
   false,
   false,
   false
  ],
  "additive": false,
  "target": [
   24,
   24
  ]
 },
 "blood_rise": {
  "anims": [
   "rise"
  ],
  "lengths": [
   120
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "charge_rings_purple": {
  "anims": [
   "contract"
  ],
  "lengths": [
   40
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "charge_rings_red": {
  "anims": [
   "contract"
  ],
  "lengths": [
   40
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "constellation_crystal": {
  "anims": [
   "orbit",
   "link",
   "detonate"
  ],
  "lengths": [
   120,
   10,
   6
  ],
  "loops": [
   true,
   false,
   false
  ],
  "additive": false,
  "target": [
   2,
   2
  ]
 },
 "crimson_crystal": {
  "anims": [
   "spawn",
   "fill_0",
   "fill_25",
   "fill_60",
   "fill_100",
   "intact",
   "hit1",
   "hit2",
   "shatter",
   "loop"
  ],
  "lengths": [
   20,
   1,
   20,
   20,
   20,
   1,
   12,
   12,
   12,
   80
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   true
  ],
  "additive": false,
  "target": [
   4,
   7
  ]
 },
 "crimson_wave": {
  "anims": [
   "wave"
  ],
  "lengths": [
   30
  ],
  "loops": [
   false
  ],
  "additive": false,
  "target": null
 },
 "crystal_condense": {
  "anims": [
   "condense",
   "burst"
  ],
  "lengths": [
   30,
   12
  ],
  "loops": [
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "dark_halo": {
  "anims": [
   "start",
   "loop",
   "end"
  ],
  "lengths": [
   12,
   60,
   10
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "death_beam": {
  "anims": [
   "fire",
   "loop"
  ],
  "lengths": [
   12,
   16
  ],
  "loops": [
   false,
   true
  ],
  "additive": false,
  "target": null
 },
 "death_beam_impact": {
  "anims": [
   "loop"
  ],
  "lengths": [
   10
  ],
  "loops": [
   true
  ],
  "additive": false,
  "target": null
 },
 "death_beam_mark": {
  "anims": [
   "mark",
   "loop"
  ],
  "lengths": [
   80,
   20
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "dim_rift": {
  "anims": [
   "variant_cave",
   "variant_plains",
   "variant_ocean",
   "variant_night_forest",
   "variant_crimson_forest",
   "variant_basalt_delta",
   "variant_soulsand_valley",
   "variant_end_city",
   "form1",
   "form2",
   "form3",
   "loop",
   "hit",
   "break"
  ],
  "lengths": [
   1,
   1,
   1,
   1,
   1,
   1,
   1,
   1,
   20,
   20,
   20,
   40,
   12,
   12
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   true,
   false,
   false
  ],
  "additive": false,
  "target": [
   4,
   9
  ]
 },
 "eclipse_dash": {
  "anims": [
   "streak"
  ],
  "lengths": [
   12
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "eclipse_moon": {
  "anims": [
   "idle",
   "eclipse"
  ],
  "lengths": [
   80,
   20
  ],
  "loops": [
   true,
   false
  ],
  "additive": false,
  "target": [
   7,
   7
  ]
 },
 "eclipse_moon_broken": {
  "anims": [
   "break",
   "idle",
   "collapse"
  ],
  "lengths": [
   16,
   60,
   20
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "eclipse_pulse": {
  "anims": [
   "pulse",
   "vortex_loop"
  ],
  "lengths": [
   24,
   80
  ],
  "loops": [
   false,
   true
  ],
  "additive": false,
  "target": null
 },
 "electrified_ground": {
  "anims": [
   "loop"
  ],
  "lengths": [
   12
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "end_lightning": {
  "anims": [
   "pulse1",
   "pulse2",
   "flicker"
  ],
  "lengths": [
   10,
   12,
   6
  ],
  "loops": [
   false,
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "end_lightning_mark": {
  "anims": [
   "mark",
   "loop"
  ],
  "lengths": [
   20,
   12
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "enderbeam": {
  "anims": [
   "fire",
   "loop"
  ],
  "lengths": [
   12,
   12
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "enderbeam_impact": {
  "anims": [
   "loop"
  ],
  "lengths": [
   10
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "enderbeam_mark": {
  "anims": [
   "mark",
   "loop"
  ],
  "lengths": [
   60,
   20
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "fear_burst": {
  "anims": [
   "burst"
  ],
  "lengths": [
   10
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "fear_core": {
  "anims": [
   "spawn",
   "loop",
   "summon"
  ],
  "lengths": [
   16,
   40,
   16
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": true,
  "target": [
   3,
   3
  ]
 },
 "fear_crystal": {
  "anims": [
   "spawn",
   "loop"
  ],
  "lengths": [
   6,
   24
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": [
   2,
   2
  ]
 },
 "fear_link": {
  "anims": [
   "loop"
  ],
  "lengths": [
   10
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "fear_runes": {
  "anims": [
   "open",
   "loop"
  ],
  "lengths": [
   40,
   80
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "final_judgment_circle": {
  "anims": [
   "spin",
   "charge",
   "pulse"
  ],
  "lengths": [
   160,
   20,
   20
  ],
  "loops": [
   true,
   false,
   true
  ],
  "additive": false,
  "target": null
 },
 "final_judgment_column": {
  "anims": [
   "rise",
   "pulse",
   "open"
  ],
  "lengths": [
   200,
   20,
   8
  ],
  "loops": [
   true,
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "fracture": {
  "anims": [
   "mark",
   "collapse",
   "pull",
   "push",
   "settle"
  ],
  "lengths": [
   20,
   20,
   20,
   20,
   30
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false
  ],
  "additive": false,
  "target": null
 },
 "frost_bullet": {
  "anims": [
   "spin"
  ],
  "lengths": [
   20
  ],
  "loops": [
   true
  ],
  "additive": false,
  "target": null
 },
 "frost_prism": {
  "anims": [
   "spawn",
   "fly",
   "shatter"
  ],
  "lengths": [
   10,
   16,
   10
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": [
   2.5,
   2.5
  ]
 },
 "heal_beam": {
  "anims": [
   "loop",
   "reverse"
  ],
  "lengths": [
   8,
   8
  ],
  "loops": [
   true,
   true
  ],
  "additive": true,
  "target": null
 },
 "heal_tally": {
  "anims": [
   "count1",
   "count2",
   "count3",
   "count4"
  ],
  "lengths": [
   60,
   60,
   60,
   60
  ],
  "loops": [
   false,
   false,
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "ice_prison": {
  "anims": [
   "freeze",
   "loop",
   "break"
  ],
  "lengths": [
   8,
   40,
   10
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "intercept_beam": {
  "anims": [
   "pulse1",
   "pulse2"
  ],
  "lengths": [
   8,
   10
  ],
  "loops": [
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "intercept_burst": {
  "anims": [
   "burst"
  ],
  "lengths": [
   12
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "intercept_cross": {
  "anims": [
   "mark",
   "expand",
   "detonate",
   "fade"
  ],
  "lengths": [
   20,
   12,
   12,
   12
  ],
  "loops": [
   false,
   false,
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "judgment_circle": {
  "anims": [
   "spin",
   "charge",
   "pulse"
  ],
  "lengths": [
   160,
   20,
   20
  ],
  "loops": [
   true,
   false,
   true
  ],
  "additive": false,
  "target": null
 },
 "judgment_column": {
  "anims": [
   "rise",
   "pulse",
   "open"
  ],
  "lengths": [
   200,
   20,
   8
  ],
  "loops": [
   true,
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "last_breath_collapse": {
  "anims": [
   "collapse"
  ],
  "lengths": [
   100
  ],
  "loops": [
   false
  ],
  "additive": false,
  "target": null
 },
 "last_breath_moon": {
  "anims": [
   "form",
   "phase1",
   "phase2",
   "phase3",
   "phase4",
   "max",
   "explode",
   "orbit",
   "vanish"
  ],
  "lengths": [
   100,
   30,
   30,
   30,
   30,
   40,
   60,
   160,
   40
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false,
   true,
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "last_breath_pillar": {
  "anims": [
   "rise",
   "loop",
   "fade"
  ],
  "lengths": [
   16,
   20,
   12
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "last_breath_radius": {
  "anims": [
   "form",
   "loop",
   "flare"
  ],
  "lengths": [
   40,
   30,
   12
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "last_breath_wave": {
  "anims": [
   "blast"
  ],
  "lengths": [
   50
  ],
  "loops": [
   false
  ],
  "additive": false,
  "target": null
 },
 "moon_tear": {
  "anims": [
   "fall",
   "stuck",
   "explode"
  ],
  "lengths": [
   8,
   20,
   10
  ],
  "loops": [
   true,
   true,
   false
  ],
  "additive": true,
  "target": [
   2,
   5
  ]
 },
 "mortal_ascent": {
  "anims": [
   "grab",
   "loop",
   "bite",
   "release"
  ],
  "lengths": [
   10,
   20,
   7,
   8
  ],
  "loops": [
   false,
   true,
   false,
   false
  ],
  "additive": false,
  "target": null
 },
 "pearl_portal": {
  "anims": [
   "blink"
  ],
  "lengths": [
   16
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "rapture": {
  "anims": [
   "grab",
   "loop",
   "bite",
   "release"
  ],
  "lengths": [
   10,
   20,
   7,
   8
  ],
  "loops": [
   false,
   true,
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "requiem_charge": {
  "anims": [
   "charge",
   "release"
  ],
  "lengths": [
   40,
   10
  ],
  "loops": [
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "requiem_orb": {
  "anims": [
   "fly"
  ],
  "lengths": [
   20
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "requiem_resonance": {
  "anims": [
   "impact",
   "resonate",
   "fade"
  ],
  "lengths": [
   12,
   40,
   20
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "rift": {
  "anims": [
   "form1",
   "form2",
   "form3",
   "loop",
   "hit",
   "break"
  ],
  "lengths": [
   20,
   20,
   20,
   40,
   20,
   12
  ],
  "loops": [
   false,
   false,
   false,
   true,
   false,
   false
  ],
  "additive": false,
  "target": [
   3,
   8
  ]
 },
 "rite_crystal": {
  "anims": [
   "fill0",
   "fill1",
   "fill2",
   "fill3",
   "intact",
   "hit1",
   "activate",
   "shatter",
   "loop"
  ],
  "lengths": [
   8,
   8,
   8,
   8,
   1,
   6,
   12,
   10,
   60
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   true
  ],
  "additive": true,
  "target": [
   4,
   6
  ]
 },
 "rite_link": {
  "anims": [
   "loop"
  ],
  "lengths": [
   8
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "rite_projectile": {
  "anims": [
   "fly"
  ],
  "lengths": [
   12
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": [
   3,
   3
  ]
 },
 "ruin_heart": {
  "anims": [
   "spawn",
   "phase0",
   "phase1",
   "phase2",
   "phase3",
   "phase4",
   "intact",
   "crack1",
   "crack2",
   "crack3",
   "loop",
   "fall",
   "shatter"
  ],
  "lengths": [
   24,
   10,
   10,
   10,
   10,
   10,
   1,
   12,
   12,
   12,
   80,
   20,
   14
  ],
  "loops": [
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   false,
   true,
   false,
   false
  ],
  "additive": false,
  "target": [
   13,
   26
  ]
 },
 "ruin_link": {
  "anims": [
   "loop"
  ],
  "lengths": [
   20
  ],
  "loops": [
   true
  ],
  "additive": true,
  "target": null
 },
 "ruin_shield": {
  "anims": [
   "start",
   "loop",
   "end"
  ],
  "lengths": [
   12,
   60,
   10
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "rush_aura": {
  "anims": [
   "start",
   "loop",
   "end"
  ],
  "lengths": [
   8,
   16,
   8
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "shockwave_purple": {
  "anims": [
   "expand"
  ],
  "lengths": [
   30
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "shockwave_red": {
  "anims": [
   "expand"
  ],
  "lengths": [
   30
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "sonic_beam": {
  "anims": [
   "fire",
   "loop"
  ],
  "lengths": [
   16,
   16
  ],
  "loops": [
   false,
   true
  ],
  "additive": true,
  "target": null
 },
 "sonic_charge": {
  "anims": [
   "charge",
   "release"
  ],
  "lengths": [
   40,
   10
  ],
  "loops": [
   true,
   false
  ],
  "additive": true,
  "target": null
 },
 "sonic_impact": {
  "anims": [
   "hit"
  ],
  "lengths": [
   16
  ],
  "loops": [
   false
  ],
  "additive": true,
  "target": null
 },
 "sonic_target": {
  "anims": [
   "charge",
   "lock"
  ],
  "lengths": [
   160,
   12
  ],
  "loops": [
   false,
   false
  ],
  "additive": true,
  "target": null
 },
 "veil_fire": {
  "anims": [
   "burst",
   "smoke_rise"
  ],
  "lengths": [
   20,
   40
  ],
  "loops": [
   false,
   true
  ],
  "additive": false,
  "target": null
 },
 "verdugo_aura": {
  "anims": [
   "start",
   "loop",
   "end"
  ],
  "lengths": [
   8,
   16,
   8
  ],
  "loops": [
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 },
 "verdugo_bind": {
  "anims": [
   "bind",
   "loop",
   "release",
   "count0",
   "count1",
   "count2",
   "count3"
  ],
  "lengths": [
   8,
   20,
   8,
   4,
   4,
   4,
   4
  ],
  "loops": [
   false,
   true,
   false,
   false,
   false,
   false,
   false
  ],
  "additive": false,
  "target": null
 },
 "verdugo_strike": {
  "anims": [
   "hit"
  ],
  "lengths": [
   9
  ],
  "loops": [
   false
  ],
  "additive": false,
  "target": null
 },
 "wrath_fault": {
  "anims": [
   "warn",
   "open",
   "loop",
   "close"
  ],
  "lengths": [
   20,
   12,
   20,
   20
  ],
  "loops": [
   false,
   false,
   true,
   false
  ],
  "additive": false,
  "target": null
 }
};
