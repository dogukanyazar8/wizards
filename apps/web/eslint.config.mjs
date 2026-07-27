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
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // `requireAdminUser()` defaults to "any admin role", so forgetting the role
    // filter silently opens a route to every role. Capabilities are the only
    // supported entry point outside the admin authorization module itself.
    files: ["src/**"],
    ignores: ["src/lib/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              importNames: ["requireAdminUser"],
              message: "Use requireAdminCapability from @/lib/admin/capabilities instead.",
              name: "@/lib/admin/access",
            },
          ],
        },
      ],
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
