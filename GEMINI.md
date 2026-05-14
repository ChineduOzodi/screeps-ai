# Project Instructions

## Architecture & Patterns
- **Colony Access:** Avoid attaching instances (like `ColonyManager`) directly to engine objects (like `Room`). Instead, use the `getColony()` pattern or instantiate `ColonyManagerImpl` using the `Colony` data from memory as needed. This ensures cleaner separation and easier testing.
- **Role Runners:** Creep roles should inherit from `CreepRunner` and utilize `this.getColony()` to access colony-wide resources and state.
- **Memory Robustness:**
    - **Cleanup First:** When introducing new persistent data in `Memory`, always implement a corresponding cleanup routine in `main.ts` or `ColonyManagerImpl.creepManager()` to handle stale entries (e.g., dead creeps, orphaned room data).
    - **Initialization Safety:** Use `initialSetup` in `ColonyManagerImpl` to clear or reset room-specific memory (`Memory.rooms[name]`) if a colony restart is detected.
    - **Validation:** spawner profiles and spawn queue processing must always validate requests against current environmental constraints (e.g., room energy capacity) to prevent deadlocks from impossible-to-fulfill requests.

## Engineering Standards
- **Testing First:** For all functional changes, always add or update unit tests to verify the intended behavior.
- **Isolated Testing:** When creating new tests for complex logic, use a specialized sub-agent (like `generalist`) to write the tests. This reduces "context contamination" where the test code is too closely biased by the implementation details in your current context.
- **Linting:** Always run ESLint on modified files using `npm run lint -- <file_path>` and fix any issues before concluding the task. Prefer `npm run lint-fix` for automatic fixes.
- **Validation:** No change is complete until its corresponding tests pass and linting is clean.
