import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
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
