import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// e2e/ Playwright specs are run separately (not by Vitest); exclude them here
// so the unit-test run doesn't try to import `playwright` as an ESM module.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx,js,mjs}"],
    exclude: ["node_modules", "dist", ".output", "e2e/**"],
    environment: "node",
  },
});
