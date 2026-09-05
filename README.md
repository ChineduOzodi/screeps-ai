# screeps-ai

A TypeScript AI for [Screeps](https://screeps.com/). It runs a set of colonies, each managing its own
rooms, creeps, energy budget, base layout, defense and expansion, under a CPU budget that scales with
the account's CPU limit and bucket.

It started from the [screeps-typescript-starter](https://github.com/screepers/screeps-typescript-starter)
template; the `docs/` folder still carries that template's generic setup guide.

## Getting started

You need Node 22 (matches CI; anything recent works) and npm.

```bash
npm install
cp screeps.sample.json screeps.json   # then put your auth token in the "main" entry
```

`screeps.json` is gitignored. It holds the token for every deploy destination and is also what the
REST helper in `tools/` reads.

| Command                    | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run build`            | Bundle `src/main.ts` into `dist/main.js` with Rollup             |
| `npm run push-main`        | Build and upload to the `main` destination in `screeps.json`     |
| `npm run push-sim`         | Same, to the simulator branch                                    |
| `npm run push-pserver`     | Same, to a private server (needs screepsmod-auth)                |
| `npm test`                 | Unit tests (Mocha + Chai + Sinon, `src/**/*.test.ts`)            |
| `npm run test-integration` | Runs a local Screeps server against the built bundle             |
| `npm run lint`             | ESLint (never fails the build; use `lint-fix` to auto-format)    |

Uploading triggers a global reset on the server, so the first tick after a deploy is expensive and
every heap cache starts cold.

## How the AI is organised

Each tick, `src/main.ts` runs these phases in order, each timed by the CPU budget:

1. **memory** cleans up dead creeps, dropped rooms and legacy keys.
2. **colonies** runs every colony in `Memory.colonies`.
3. **spawns** drains each spawn's queue.
4. **creeps** runs every creep. Essential roles always run; upgraders, builders, repairers, scouts and
   other deferrable roles run in rotation while CPU lasts, and just keep walking when skipped.
5. **rooms** runs per-room logic and, when CPU allows, draws the room and world-map overlays.

### Colonies

A colony is one owned room plus the remote rooms it mines. `ColonyManagerImpl` in
`src/prototypes/colony.ts` owns a set of **systems** and **managers**:

- **Systems** (`src/systems/`) each request creeps and compete for a share of the colony's energy
  income: energy (harvesting, mining, hauling), upgrade, builder, defense, infrastructure and
  expansion. The colony estimates gross production and upkeep, then hands each system an allowed
  work rate based on its requested weight and how much energy is stored.
- **Managers** (`src/managers/`) drive structures: construction, roads, links, terminal (energy
  sharing and market-bought reagents), labs (reactions and boosts) and observers (scouting).
- **Spawning** (`src/infrastructure/spawning.ts`) turns system spawner profiles into a spawn queue
  and validates every request against what the room can actually afford.

Expansion kicks in at RCL 4: the colony picks the best scouted room, sends a claimer and pioneers,
and the new spawn registers itself as a fresh colony.

### Creeps

Every role in `src/creep-roles/` extends `CreepRunner` and reaches its colony through `getColony()`.
`CreepManagement` maps a creep's memory role to its runner. Movement goes through
`src/infrastructure/movement.ts`, which uses a heap-resident path cache and per-position reservations
so creeps do not fight over mining seats.

### Base planning and defense

`src/utils/` holds the room planners: `core-planner` and `extension-planner` lay out the base on the
terrain, `perimeter-planner` builds a wall-and-rampart perimeter from a min-cut (`min-cut.ts`) and
reuses any walls already there, `room-survey` and `room-grid` do the terrain analysis.

Defense (`src/systems/defense-system.ts`, `threat-assessment.ts`, `squad-coordinator.ts`,
`combat-body.ts`, `safe-mode.ts`) sizes defenders and healers to the threat, holds ramparts,
coordinates squads with a shared focus target, and triggers safe mode only when the room would
actually fall. Power banks are ignored.

### CPU budget

`src/utils/cpu-budget.ts` decides how much CPU the tick may spend and which work can wait. Everything
scales from `Game.cpu.limit` and the bucket. It exposes:

- `CpuBudget.every(n)` for periodic jobs, which stretch under pressure.
- `CpuBudget.optionalAllowed()` for visuals and other cosmetic work.
- `CpuBudget.canRunDeferrable()` for the creep rotation described above.
- `Memory.stats.cpu`, written every tick, with mode, target, average and per-phase cost.

### Other pieces

- `src/goap/` is a small A\* goal-oriented action planner with colony-management and infrastructure
  actions.
- `src/visuals/` draws the in-room intel panel and the world-map overlay of what the AI thinks about
  every room it remembers.
- `src/utils/ErrorMapper.ts` maps bundled stack traces back to TypeScript source using the uploaded
  source map. The last runtime error is kept in `Memory._lastError`.
- `screeps-profiler` is enabled in `main.ts`; use its console commands to profile.

## Runtime settings in Memory

All toggles live under `Memory.settings` and take effect on the next tick:

| Key              | Default | Effect                                                             |
| ---------------- | ------- | ------------------------------------------------------------------ |
| `debug`          | off     | Print `Logger.debug` lines. Info, warning and error always print.  |
| `visuals`        | on      | Set `false` to drop all RoomVisual output regardless of CPU.       |
| `generatePixels` | off     | Spend a full bucket on a pixel (official server only).             |

From the game console:

```js
Memory.settings = Memory.settings || {}; Memory.settings.debug = true;
```

## Talking to the live server from your machine

`tools/screeps-api.js` uses the token in `screeps.json` to read and write your live game through the
REST API. The shard defaults to the first one you own rooms on.

```bash
node tools/screeps-api.js me                          # account, CPU limit, GCL
node tools/screeps-api.js stats                       # Memory.stats.cpu
node tools/screeps-api.js memory [shard] [path]       # size breakdown of Memory or a sub-path
node tools/screeps-api.js dump [shard] [path] [file]  # pretty-print Memory, optionally to a file
node tools/screeps-api.js debug on|off|status         # toggle Memory.settings.debug
node tools/screeps-api.js set <path> <json>           # write any value, e.g. set settings.visuals false
node tools/screeps-api.js console "<expression>"      # run an expression in the game console
```

Writes land before the next tick. Console output only shows in the in-game console; the API just
acknowledges the command.

## Testing

Unit tests sit next to the code as `*.test.ts` and run with plain Node, with Screeps globals stubbed
in `test/setup-mocha.js`. Integration tests in `test/integration/` boot a local Screeps server and
need the native build to succeed, so they are slower and not run in CI.

Every functional change should come with a unit test. Run `npm test` and `npm run lint` before
committing.

## CI

`.github/workflows/ci.yml` lints, builds and runs the unit tests on every push and pull request. The
deploy job uploads to Screeps using the `SCREEPS` secret, but only on pushes to a branch named
`main`; this repo's default branch is `master`, so deploys are done locally with `npm run push-main`.
