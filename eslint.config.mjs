import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Known debt, kept visible rather than silenced: the database facade
      // (src/lib/db.ts) deliberately returns `any`, and most annotations in
      // routes and pages follow from it. Typing the facade is the real fix.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler diagnostics. Rune doesn't enable the compiler
      // (next.config.ts has no `reactCompiler`), and the patterns these flag -
      // syncing a ref during render, an effect calling a function declared
      // below it, Date.now() for "time ago" labels - are correct without it.
      // Warnings, so they show up when the compiler is adopted.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    // Test doubles stand in for Prisma delegates and request objects.
    files: ["tests/**", "tests-e2e/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mcp-server/**",
    // Generated output and local data, not source.
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "data/**",
  ]),
]);

export default eslintConfig;
