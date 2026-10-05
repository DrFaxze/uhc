# Improve Dragon para Minecraft Bedrock 26.50

Port del mod **Improve Dragon 2.3.2** (Forge 1.20.1) como add-on de **Minecraft Bedrock 26.50**: el rework completo
del Ender Dragon con 4 fases, 3 estados (vuelo, centro y físico), pasivas, ~45 habilidades, dos especiales
(Eclipse y Luna de sangre) y la muerte "Último Aliento". Modifica al dragón vanilla, así que la pelea del End
(cristales, portal, huevo, resurrección) sigue siendo la de siempre.

- Solo usa la **API estable** (`@minecraft/server` 2.10.0): **no hace falta activar opciones experimentales**.
- Los 76 modelos y animaciones del mod (Blockbench / GeckoLib) ya estaban en formato Bedrock y se usan tal cual.

## Instalar

1. Descarga [`dist/ImproveDragon.mcaddon`](dist/ImproveDragon.mcaddon) y ábrelo (Minecraft lo importa solo).
2. En el mundo, activa **el paquete de comportamiento y el de recursos** "Improve Dragon".
3. Ve al End. Un dragón que ya existía se adapta solo (5000 de vida la primera vez que se carga).

En multijugador o Realms el add-on va en el mundo/servidor; los jugadores descargan el paquete de recursos al entrar.

## Cambios de balance respecto a la versión Java

Pedidos para este port (se aplican al golpear, en `src/core/damage.ts`; la config conserva los números de Java):

| Qué | Java | Bedrock |
|---|---|---|
| Daño normal ≤ 80 | tal cual | **la mitad** (16 → 8, 40 → 20, 80 → 40) |
| Daño normal > 80 | tal cual | **comprimido de 40 a 160**: `40 + (d − 80) · 120 / 920` (100 → 42,6 · 160 → 50,4 · 300 → 68,7 · 400 → 81,7 · 1000 → 160) |
| Daño verdadero | tal cual | **la mitad** (Agarre 4/20 → 2/10, Réquiem 12 → 6, Ascenso del Depredador 2/26/10 → 1/13/5…) |
| Flechas / cuerpo a cuerpo por fase | F1 +200 % / +80 %, F2-3 +20 % / +20 %, F4 −10 % / −20 % | **100 % en todas las fases** |
| Último Aliento | letal | letal (sin cambios) |

Se mantienen la inmunidad a explosiones, la inmunidad a proyectiles en el estado físico de la ira, las
reducciones de daño del Rito carmesí / Constelación del miedo / Luna de sangre y las inmunidades de las cargas y
especiales. Las curaciones del dragón no cambian.

## Comandos (operador)

| Comando | Qué hace |
|---|---|
| `/improvedragon:info` | Fase, estado, habilidad en curso y vida |
| `/improvedragon:phase <1-4>` | Fuerza una fase |
| `/improvedragon:state <flight\|center\|physical>` | Fuerza un estado |
| `/improvedragon:cast <habilidad>` | Lanza una habilidad o ataque físico (`rush`, `eclipse`, `blood_moon`, `bite`, …) |
| `/improvedragon:health <0-1>` | Fija la vida como fracción de la máxima |
| `/improvedragon:stop` | Cancela lo que esté haciendo |
| `/improvedragon:lastbreath` | Empieza el Último Aliento |
| `/improvedragon:debug <true\|false>` | Mensajes de depuración en el log de contenido |

Las entidades con el tag `improvedragon_target` cuentan como objetivos (para probar con aldeanos).

## Diferencias con la versión Java (limitaciones de Bedrock)

- **Movimiento**: en Bedrock la IA del dragón no se puede reescribir. En la **fase 1** manda la IA vanilla de
  Bedrock (con ráfagas de 5 bolas en las pasadas, como la "vanilla+" de Java). **Desde la transición 1→2** el script
  quita los objetivos vanilla del dragón (`improvedragon:scripted`) y lo pilota por teleport con la misma física de
  vuelo que el EnderDragon de Java (aceleración, giro limitado, tope de velocidad y altura, rodeo de pilares).
- **Posado en el centro**: el dragón queda suspendido sobre el podio (Bedrock no deja usar su pose sentada sin su IA).
- **Agarres** (Rapto, Ascenso mortal, Agarre, Sanguinario…): el jugador va montado en un asiento invisible que el
  dragón lleva en la boca. Se suelta **agachándose** durante la ventana de escape; después se bloquea el desmontar.
- **Escudo**: en Bedrock el escudo se levanta agachándose. El script considera que bloquea si el jugador está
  agachado, lleva escudo y mira hacia el dragón; "desactivar el escudo" es un enfriamiento de 5 s del escudo.
- **Daño**: Bedrock no permite tipos de daño propios; se usan causas vanilla (los mensajes de muerte son
  genéricos). El daño verdadero se resta directamente de la vida (el tótem sigue salvando). Bedrock aplica sus
  frames de invulnerabilidad a todo el daño normal (en Java algunos tipos se los saltaban).
- **Ocultar al dragón** (Cacería del Eclipse, Último Aliento): invisibilidad y apartarlo; la barra de jefe sigue.
- **Niebla y tintes de pantalla** (Luna de sangre, Eclipse): niebla del paquete de recursos + fundidos de cámara.
- **Partículas**: polvo de color, chispas y ondas de anillo son partículas propias; el resto son las vanilla más
  parecidas de Bedrock, con menos cantidad (en Bedrock cada partícula es un paquete de red).
- **Texturas animadas** (`rush_aura`, `veil_fire`, `verdugo_aura`): animadas con `uv_anim`.
- **Sin archivo de config**: los valores están en `src/config.ts` (mismos nombres que `DragonConfig` de Java).
- **Proyectiles propios** (Bala congelante, Prisma gélido, proyectiles del Rito, lágrimas): son entidades de efecto
  que el script mueve y cuyos choques calcula él mismo.
- **Congelación**: Bedrock no tiene `ticksFrozen`; se usa lentitud, copos de nieve y (Prisma) inmovilización.
- **Regenerar pilares** (Curación con los 4 cristales llenos): no se puede volver a generar la estructura; se
  vuelve a poner un cristal del End en lo alto de cada pilar que no lo tenga.
- **Invocaciones** (Constelación del miedo, Grietas dimensionales): no se puede bajar la vida máxima con la API
  estable; se fija la vida actual. Sin botín ni experiencia (se borran los objetos y orbes que sueltan al morir).
  El guardián "montado" en el ahogado le sigue por teleport si no se puede montar de verdad. Los piglins y hoglins
  de las grietas reciben periódicamente el evento que detiene la zombificación.
- **Pantalla roja de la Luna de sangre**: niebla roja durante toda la noche carmesí y un fundido rojo al empezar
  (Bedrock no tiene un velo de color permanente).
- **Último Aliento**: el dragón queda oculto y apartado; la muerte vanilla (portal, huevo, experiencia) llega
  ~2,5 s después de la explosión, como en Java. Si se recarga el mundo a mitad, la cronología se reanuda.
- **Sonidos**: todos vanilla de Bedrock, los más parecidos a los de Java.
- **Sin probar en el juego**: el port compila y los paquetes se validan, pero no se ha podido probar dentro de
  Minecraft desde el entorno donde se hizo. Si algo se ve mal orientado (haces, modelos) o no responde, abre una
  incidencia con `/improvedragon:debug true` activado.

## Compilar

Requiere Node 18+.

```sh
npm install
npm run build      # gen → typecheck → bundle → validate → pack  ⇒  dist/ImproveDragon.mcaddon
```

- `tools/gen.mjs` genera `build/BP` y `build/RP`: copia `packs/` y convierte cada modelo de `assets-src/` en una
  entidad de efecto `improvedragon:<modelo>` (geometría con un hueso raíz que orienta/escala, controladores de
  animación por ranura, render controller) y escribe `src/generated/models.ts`.
- `tools/bundle.mjs` empaqueta `src/` en `build/BP/scripts/main.js`.
- `tools/validate.mjs` comprueba JSON y referencias; `tools/pack.mjs` crea el `.mcaddon`.

## Estructura

```
assets-src/          modelos, animaciones y texturas del mod original (formato Bedrock)
packs/BP, packs/RP   archivos escritos a mano (manifiestos, override del dragón, partículas, niebla, …)
src/
  main.ts            eventos: seguimiento del dragón, daño recibido, golpe letal, bucle por tick
  config.ts          todos los números (DragonConfig)
  commands.ts        /improvedragon:*
  core/              damage.ts (tipos de daño, rebalanceo, escudo, empujes), world.ts (sonido, partículas, suelo)
  fx/                effect.ts (entidades de efecto y golpeables), seat.ts (agarres)
  boss/              brain.ts (fases, transiciones, estados, pasivas), flight.ts (vuelo), abilities.ts (kits)
    ability/         draconic/ y wrath/: una clase por habilidad (mismos nombres que en Java)
    physical/        controller.ts (acecho/ataque/retirada), base.ts y los ataques físicos
  world/             lastBreath.ts (Último Aliento), icePrison.ts
tools/               gen, bundle, validate, pack
```
