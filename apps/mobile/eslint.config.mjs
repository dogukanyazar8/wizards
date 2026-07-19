import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Focused lint: React Hooks correctness only. `tsc6 --noEmit` (the `lint`/
// `typecheck` scripts) still owns type safety; this config adds the one class
// of bug the type checker cannot see — hook rules + dependency-array mistakes.
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".expo/**",
      "android/**",
      "ios/**",
      "web-build/**",
      "scripts/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}", "App.tsx", "component-tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // A missing/extra hook call crashes at runtime — hard error.
      "react-hooks/rules-of-hooks": "error",
      // Missing deps cause stale closures / memos that never hold. Warn so the
      // pre-existing backlog does not block CI; fix incrementally.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
