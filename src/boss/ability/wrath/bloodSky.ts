import { Player, system, world } from '@minecraft/server';
import { end } from '../../../core/world';

/**
 * Cielo rojo de la Luna de sangre (ClientFx de Java: niebla roja y velo rojo en pantalla mientras existe
 * el efecto "blood_rise"). En Bedrock: la niebla improvedragon:blood_fog del RP en la pila de cada jugador
 * del End y un fundido rojo de la cámara al entrar.
 */
const FOG = 'improvedragon:blood_fog';
const FOG_USER = 'improvedragon_blood';
/** Color del velo de Java (0x8A0008). */
const RED = { red: 138 / 255, green: 0, blue: 8 / 255 };

const fogged = new Set<string>();
let active = false;

function pushFog(p: Player): void {
  try {
    p.runCommand(`fog @s push ${FOG} ${FOG_USER}`);
  } catch {
    /* ignorar */
  }
  try {
    // El velo de Java sube en ~2,5 s; aquí, un fundido rojo que se va despacio.
    p.camera.fade({ fadeColor: RED, fadeTime: { fadeInTime: 0.8, holdTime: 0.2, fadeOutTime: 2.5 } });
  } catch {
    /* ignorar */
  }
}

function removeFog(p: Player): void {
  try {
    p.runCommand(`fog @s remove ${FOG_USER}`);
  } catch {
    /* no la tenía */
  }
}

/** Enciende o apaga el cielo rojo. */
export function bloodSky(on: boolean): void {
  if (on === active) return;
  active = on;
  if (!on) {
    for (const p of world.getAllPlayers()) if (fogged.has(p.id)) removeFog(p);
    fogged.clear();
  }
  tickBloodSky();
}

/** Mantiene la niebla en los jugadores del End (los que llegan la reciben, los que se van la pierden). */
export function tickBloodSky(): void {
  if (!active) return;
  let inEnd: Player[] = [];
  try {
    inEnd = end().getPlayers();
  } catch {
    inEnd = [];
  }
  const ids = new Set<string>();
  for (const p of inEnd) {
    ids.add(p.id);
    if (!fogged.has(p.id)) {
      fogged.add(p.id);
      pushFog(p);
    }
  }
  for (const id of [...fogged]) {
    if (ids.has(id)) continue;
    fogged.delete(id);
    const p = world.getAllPlayers().find((q) => q.id === id);
    if (p) removeFog(p);
  }
}

// Niebla que quedó puesta de una sesión anterior de scripts (recarga a mitad de la luna).
system.runTimeout(() => {
  if (active) return;
  for (const p of world.getAllPlayers()) removeFog(p);
}, 20);
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || active) return;
  system.run(() => {
    if (player.isValid) removeFog(player);
  });
});
