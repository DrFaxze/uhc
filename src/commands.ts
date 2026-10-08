import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Entity,
  system,
  type CustomCommandOrigin,
  type CustomCommandResult,
} from '@minecraft/server';
import { castable } from './boss/abilities';
import { Brain, brainOf, brains, DEBUG } from './boss/brain';
import { end } from './core/world';
import { Effect } from './fx/effect';
import { MODELS } from './generated/models';
import { V } from './util/vec';

/** El dragón más cercano al que ejecuta el comando (o el primero que haya). */
function dragon(origin: CustomCommandOrigin): Brain | null {
  let best: Brain | null = null;
  let bestD = Infinity;
  const from = origin.sourceEntity?.location;
  const list: Entity[] = [];
  try {
    list.push(...end().getEntities({ type: 'minecraft:ender_dragon' }));
  } catch {
    /* el End no está cargado */
  }
  for (const e of list) {
    const d = from ? (e.location.x - from.x) ** 2 + (e.location.z - from.z) ** 2 : 0;
    if (d < bestD) {
      bestD = d;
      best = brainOf(e);
    }
  }
  if (!best) for (const b of brains()) return b;
  return best;
}

function ok(message: string): CustomCommandResult {
  return { status: CustomCommandStatus.Success, message };
}
function fail(message: string): CustomCommandResult {
  return { status: CustomCommandStatus.Failure, message };
}

/** Pasa el mensaje a quien ejecutó el comando cuando el resultado llega en el siguiente tick. */
function later(origin: CustomCommandOrigin, fn: (b: Brain) => string): CustomCommandResult {
  system.run(() => {
    const b = dragon(origin);
    const msg = b ? fn(b) : 'No hay ningún Ender Dragon cargado en el End.';
    try {
      const who = origin.sourceEntity ?? origin.initiator;
      if (who && who.typeId === 'minecraft:player') (who as unknown as { sendMessage(m: string): void }).sendMessage(`§d[Improve Dragon]§r ${msg}`);
      else console.warn(`[improvedragon] ${msg}`);
    } catch {
      /* ignorar */
    }
  });
  return ok('');
}

/** /improvedragon:<subcomando> (permiso de operador), como /improvedragon de la versión Java. */
export function registerCommands(): void {
  system.beforeEvents.startup.subscribe(({ customCommandRegistry: reg }) => {
    const perm = CommandPermissionLevel.GameDirectors;
    reg.registerEnum('improvedragon:state', ['flight', 'center', 'physical']);
    reg.registerEnum('improvedragon:ability', castable());
    reg.registerEnum('improvedragon:model', Object.keys(MODELS));

    reg.registerCommand({ name: 'improvedragon:info', description: 'Estado del dragón (fase, estado, habilidad, vida)', permissionLevel: perm }, (o) =>
      later(o, (b) => b.describe()),
    );

    reg.registerCommand(
      {
        name: 'improvedragon:phase',
        description: 'Fuerza la fase 1-4',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'fase', type: CustomCommandParamType.Integer }],
      },
      (o, phase: number) => {
        if (phase < 1 || phase > 4) return fail('La fase va de 1 a 4.');
        return later(o, (b) => {
          b.forcePhase(phase);
          return `fase ${phase} forzada`;
        });
      },
    );

    reg.registerCommand(
      {
        name: 'improvedragon:state',
        description: 'Fuerza el estado (vuelo, centro o físico)',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'improvedragon:state', type: CustomCommandParamType.Enum }],
      },
      (o, which: string) =>
        later(o, (b) => {
          if (b.activePhase() < 2) b.forcePhase(2);
          b.forceState(which);
          return `estado ${which} forzado`;
        }),
    );

    reg.registerCommand(
      {
        name: 'improvedragon:cast',
        description: 'Lanza una habilidad o un ataque físico',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'improvedragon:ability', type: CustomCommandParamType.Enum }],
      },
      (o, id: string) =>
        later(o, (b) => {
          if (b.activePhase() < 2) b.forcePhase(2);
          if (b.cast(id, id === 'eclipse' || id === 'blood_moon')) return `habilidad ${id}`;
          const target = b.nearestTarget(b.position(), 160);
          if (b.physical.start(id, target)) {
            b.forceState('physical');
            return `ataque ${id}`;
          }
          return `no se pudo lanzar ${id} (¿sin objetivos?)`;
        }),
    );

    reg.registerCommand(
      {
        name: 'improvedragon:health',
        description: 'Fija la vida del dragón como fracción de la máxima (0-1)',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'fraccion', type: CustomCommandParamType.Float }],
      },
      (o, f: number) =>
        later(o, (b) => {
          b.setHealth(Math.max(0.001, Math.min(1, f)) * b.maxHealth());
          return `vida = ${Math.floor(b.health())}`;
        }),
    );

    reg.registerCommand({ name: 'improvedragon:stop', description: 'Cancela habilidades y efectos en curso', permissionLevel: perm }, (o) =>
      later(o, (b) => {
        b.cancelAll();
        return 'cancelado';
      }),
    );

    reg.registerCommand({ name: 'improvedragon:lastbreath', description: 'Empieza el Último Aliento', permissionLevel: perm }, (o) =>
      later(o, (b) => {
        b.beginDeath();
        return 'Último Aliento';
      }),
    );


    reg.registerCommand(
      {
        name: 'improvedragon:fxtest',
        description: 'Crea un efecto con modelo 6 bloques delante (diagnóstico)',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'improvedragon:model', type: CustomCommandParamType.Enum }],
      },
      (o, model: string) => {
        system.run(() => {
          const who = o.sourceEntity;
          const say = (m: string) => {
            try {
              if (who && who.typeId === 'minecraft:player') (who as unknown as { sendMessage(m: string): void }).sendMessage(`§d[Improve Dragon]§r ${m}`);
            } catch {
              /* ignorar */
            }
          };
          if (!who) return;
          try {
            const look = V.of(who.getViewDirection()).flat().normalize();
            const at = V.of(who.location).add(look.scale(6)).add(0, 1, 0);
            const info = MODELS[model];
            const fx = Effect.spawn(model, at, info.anims.filter((_, i) => info.loops[i]).slice(0, 1).join('') || info.anims[0] || '', 0.25, 200);
            say(`${model}: entidad ${fx.entity.typeId} creada en ${at} (válida: ${fx.valid}). Si no la ves, el fallo está en el paquete de recursos.`);
          } catch (err) {
            say(`${model}: no se pudo crear (${err}). El fallo está en el paquete de comportamiento.`);
          }
        });
        return ok('');
      },
    );

    reg.registerCommand(
      {
        name: 'improvedragon:debug',
        description: 'Activa o quita el registro de depuración en el log de contenido',
        permissionLevel: perm,
        mandatoryParameters: [{ name: 'activo', type: CustomCommandParamType.Boolean }],
      },
      (_o, on: boolean) => {
        DEBUG.on = on;
        return ok(`depuración ${on ? 'activada' : 'desactivada'}`);
      },
    );
  });
}
