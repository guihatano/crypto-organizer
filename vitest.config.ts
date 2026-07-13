import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // Runs before each test file's own module graph is evaluated —
    // guarantees DATABASE_PATH=':memory:' is set before src/db/client.ts
    // opens its connection (see env.setup.ts for why this can't live at
    // the top of testDb.ts instead).
    setupFiles: ['./src/server/__tests__/env.setup.ts'],
    // Integration test files each open their own in-memory SQLite DB via
    // src/db/client.ts. Running test files in parallel can race when the
    // sandbox has few CPU cores (module isolation between files becomes
    // unreliable), causing cross-file DB state bleed (FK/column errors).
    // Serializing file execution keeps each file's in-memory DB isolated
    // and deterministic; the suite is small enough that this costs
    // negligible wall-clock time.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**', 'src/lib/**', 'src/server/**'],
      exclude: ['src/engine/types.ts', 'src/engine/__tests__/**', 'src/server/__tests__/**'],
      // Gate: engine/lib/server combined must stay >=80% covered
      // (aggregate — see W0-5/W3-3 SUMMARY for the per-file breakdown).
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
})
