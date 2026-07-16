import { defineConfig } from "vitest/config";
import path from "node:path";

// Production-like auth cookie config (https baseURL => __Secure- prefixed cookies).
// Separate project because tests/setup.ts pins an http BETTER_AUTH_URL and env is
// parsed once per process (singleFork), so both configs cannot coexist in one run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests-secure/**/*.test.ts"],
    setupFiles: ["./tests-secure/env.ts", "./tests/setup.ts"],
    globals: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@atender/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
