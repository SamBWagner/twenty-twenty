import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

const commonGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  Event: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  globalThis: "readonly",
  Headers: "readonly",
  process: "readonly",
  Request: "readonly",
  Response: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
};

const browserGlobals = {
  document: "readonly",
  HTMLElement: "readonly",
  HTMLTextAreaElement: "readonly",
  localStorage: "readonly",
  MouseEvent: "readonly",
  navigator: "readonly",
  PointerEvent: "readonly",
  window: "readonly",
};

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/.astro/",
    "playwright-report/",
    "test-results/",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,astro}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...commonGlobals,
        ...browserGlobals,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "off",
    },
  },
]);
