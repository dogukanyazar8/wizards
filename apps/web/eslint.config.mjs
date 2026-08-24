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
  {
    // The Ana Sayfa scale engine grows the root font size per resolution step, so an arbitrary px
    // value stays physically small on 2K/4K. The existing 120 files still carry 1208 of them and
    // migrate phase by phase (`node scripts/quality/count-arbitrary-px.mjs`); this rule keeps the
    // new surfaces rem-only from the first commit instead of adding to that debt.
    files: [
      "src/app/(main)/events/**",
      // Mesajlar Dalga 3: sohbet ve DM yüzeylerinin 152 arbitrary px değeri
      // rem'e taşındı. `min-[420px]:` gibi **medya varyantları** kapsam dışı
      // kalır ve kalmalı: onlar fiziksel görünüm alanı genişliğidir, kök font
      // boyutuyla ölçeklenmemeleri gerekir.
      "src/components/chat/**",
      "src/components/dm/**",
      "src/app/(main)/home/**",
      "src/app/(main)/inbox/**",
      "src/app/(main)/mentions/**",
      "src/components/command/**",
      // Etkinlikler Dalga 2 / Ş7: ekranın ilk bileşenleri iniyor. Kapsam kod yazılmadan
      // **önce** açılır — sonradan açılan bir kural, taşınacak borcu önce büyütür sonra ölçer
      // (Bahsedilmeler Ş0.1 aynı gerekçeyle `components/mentions/**` açtı).
      "src/components/events/**",
      "src/components/home/**",
      "src/components/messages/**",
      // Bahsedilmeler Dalga 0 / Ş0.1: ekran ilk satırından itibaren rem-only yazılır.
      // Kapsam kod yazılmadan **önce** açılır — sonradan açılan bir kural, taşınacak
      // borcu önce büyütür sonra ölçer.
      "src/components/mentions/**",
      "src/components/screens/**",
      "src/components/shell/app-nav-panel.tsx",
      // Etkinlikler Dalga 2 / Ş5: ölçü sözlüğünün kendisi ve hafta hesabı da aynı kapıdan
      // geçer. Kabul kriteri ("ana kolonda ölçü sözlüğü dışında sabit px yok") bir `grep`
      // ile değil bu kuralla kilitlenir; `grep` yalnız bugünü ölçer.
      "src/lib/events/**",
      "src/lib/mentions/**",
      "src/lib/messages/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          message:
            "Arbitrary px does not scale with the root font size. Use a rem-based utility, or hairline() from @/lib/home/metrics for borders and dividers.",
          // `min-[420px]:` ve `max-[900px]:` **medya varyantlarıdır**: fiziksel görünüm
          // alanı genişliğini ölçerler ve kök font boyutuyla ölçeklenmemeleri gerekir.
          // Lookbehind ikisini dışlıyor; `min-h-[36px]` yakalanmaya devam ediyor, çünkü
          // orada `-[` öncesindeki üç karakter `min` değil.
          selector: "Literal[value=/(?<!min)(?<!max)-\\[-?\\d+(\\.\\d+)?px\\]/]",
        },
        {
          message:
            "Arbitrary px does not scale with the root font size. Use a rem-based utility, or hairline() from @/lib/home/metrics for borders and dividers.",
          selector: "TemplateElement[value.raw=/(?<!min)(?<!max)-\\[-?\\d+(\\.\\d+)?px\\]/]",
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
