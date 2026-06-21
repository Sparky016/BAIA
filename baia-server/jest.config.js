module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  /**
   * Collect coverage from all TypeScript source files, but exclude:
   *   - main.ts          — bootstrap entry point; not unit-testable
   *   - *.module.ts      — NestJS module wiring (declarative, no logic)
   *   - *.spec.ts        — test files themselves
   *   - index.ts         — barrel re-exports (no logic)
   *   - **\/dto\/**      — DTO classes (plain data shapes, sourced from baia-shared)
   */
  collectCoverageFrom: [
    '**/*.ts',
    '!main.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    '!**/index.ts',
    '!**/dto/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'json-summary'],
  /**
   * Use V8 native coverage provider instead of Babel/Istanbul instrumentation.
   * V8 avoids false branch penalties from TypeScript-emitted DI constructor
   * parameter property patterns (e.g., `private nestConfig: NestConfigService`).
   */
  coverageProvider: 'v8',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // baia-shared publishes ESM-only `exports`; map the workspace import to its
    // TypeScript source so ts-jest (CommonJS) can resolve @baia/shared in tests.
    '^@baia/shared$': '<rootDir>/../../baia-shared/src/index.ts',
  },
  /**
   * Global coverage gates — enforced on every `jest --coverage` run.
   * §A7: section gate ≥85% lines / ≥80% branches.
   * Tests fail if thresholds are not met.
   */
  coverageThreshold: {
    global: {
      lines: 85,
      branches: 80,
      functions: 80,
      statements: 85,
    },
    /**
     * Per-module ≥90% override for core-logic modules.
     * Convention: add an entry here as each core-logic module lands.
     * Example (uncomment and adjust path when the module is implemented):
     *
     *   './llm/': { lines: 90, branches: 90, functions: 90, statements: 90 },
     *   './explore/': { lines: 90, branches: 90, functions: 90, statements: 90 },
     *   './reconcile/': { lines: 90, branches: 90, functions: 90, statements: 90 },
     *
     * The paths below are placeholders — they activate once those modules exist.
     */
  },
};
