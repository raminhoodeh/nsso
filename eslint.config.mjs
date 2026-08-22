import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "nsso agent context database/**",
    "private/**",
    "liquid-glass-js-main/**",
    "liquid-logo-main/**",
    "src/lib/liquid-glass/**",
    "*.log",
    "check_*.sql",
    "test_*.sql",
    "verify_*.sql",
    "clear_film_data.sql",
    "test_db.js",
    "check_models.js",
    "update_products_urls.py",
    "src/app/dashboard/page.tsx.*",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
