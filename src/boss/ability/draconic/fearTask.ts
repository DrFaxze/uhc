import { Entity, Player } from '@minecraft/server';
import { C } from '../../../config';
import { alive, mid } from '../../../core/world';
import type { Effect } from '../../../fx/effect';
import { rand } from '../../../util/rand';
import type { Task } from '../../api';
import type { Brain } from '../../brain';
import { SUMMON_TAG, type CenterCrystal } from './centerUtil';

const WITHER = 'minecraft:wither';
const WARDEN = 'minecraft:warden';

/**
 * Constelación del miedo (FearTask): a los 16 ticks el núcleo invoca withers y wardens con vida limitada,
 * unidos a él por un haz. Si el núcleo se rompe, las invocaciones desaparecen.
 */
export class FearTask implements Task {
  static readonly SUMMON_TAG = SUMMON_TAG;
  private readonly summons: Entity[] = [];
  private readonly links: Effect[] = [];
  private t = 0;

  constructor(
    private readonly core: CenterCrystal,
    _crystals: CenterCrystal[],
  ) {}

  damageTaken(): number {
    return 1 - C.FEAR_RESISTANCE;
  }

  tick(brain: Brain): boolean {
    this.t++;
    if (this.t === 16) {
      let players = 0;
      for (const e of brain.targets()) if (e instanceof Player) players++;
      const each = C.FEAR_BASE + C.FEAR_PER_PLAYER * players;
      for (let i = 0; i < each; i++) {
        this.summon(brain, WITHER, i, each);
        this.summon(brain, WARDEN, i, each);
      }
      brain.sound(this.core.position(), 'mob.wither.spawn', 8, 1.4);
      brain.log(`constelacion del miedo: ${each} withers y ${each} wardens`);
    }
    const coreGone = this.core.isRemoved();
    let any = false;
    for (let i = 0; i < this.summons.length; i++) {
      const mob = this.summons[i];
      const link = this.links[i];
      if (!alive(mob)) {
        link.discard();
      } else if (coreGone) {
        this.vanish(brain, mob);
        link.discard();
      } else {
        any = true;
        const c = this.core.position().add(0, 1, 0);
        if (link.valid) link.moveTo(c).aimAt(mid(mob));
      }
    }
    return this.t > 16 && !any;
  }

  private summon(brain: Brain, type: string, i: number, total: number): void {
    const a = ((i + (type === WARDEN ? 0.5 : 0)) * Math.PI * 2) / Math.max(1, total);
    const c = brain.center();
    const at = brain.ground(c.add(Math.cos(a) * 14, 0, Math.sin(a) * 14));
    const y = type === WITHER ? at.y + 6 : at.y;
    let mob: Entity;
    try {
      mob = brain.dragon.dimension.spawnEntity(type, { x: at.x, y, z: at.z });
    } catch {
      return;
    }
    try {
      mob.setRotation({ x: 0, y: rand.nextFloat() * 360 });
      mob.addTag(SUMMON_TAG);
      // No se puede bajar la vida máxima con la API estable: se deja la actual en FEAR_SUMMON_HEALTH.
      const h = mob.getComponent('minecraft:health');
      h?.setCurrentValue(Math.min(h.effectiveMax, C.FEAR_SUMMON_HEALTH));
    } catch {
      /* ignorar */
    }
    brain.fx('fear_burst', at.add(0, 1, 0), 'burst', 1.5, 12);
    this.summons.push(mob);
    this.links.push(brain.fx('fear_link', this.core.position(), 'loop', 1, 0));
  }

  private vanish(brain: Brain, mob: Entity): void {
    try {
      const p = mob.location;
      brain.fx('fear_burst', { x: p.x, y: p.y + 1, z: p.z }, 'burst', 2, 12);
      brain.sound(p, 'mob.endermen.portal', 6, 1.4);
      mob.remove();
    } catch {
      /* ya no está */
    }
  }

  cancel(brain: Brain): void {
    for (const mob of this.summons) if (alive(mob)) this.vanish(brain, mob);
    for (const link of this.links) link.discard();
  }
}
