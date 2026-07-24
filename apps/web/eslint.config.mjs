import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const reactCompilerRules = Object.fromEntries(
  Object.keys(reactHooksPlugin.configs.flat["recommended-latest"].rules).map((rule) => [
    rule,
    "error",
  ]),
);

const eslintConfig = defineConfig(
  ...tseslint.configs.recommended,
  reactHooksPlugin.configs.flat["recommended-latest"],
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactCompilerRules,
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  globalIgnores([
    ".next/**",
    "dist/**",
    "node_modules/**",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo",
  ]),
);

export default eslintConfig;
