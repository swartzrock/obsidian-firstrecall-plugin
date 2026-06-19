import json from "@eslint/json";
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

const typedParserOptions = { project: "./tsconfig.eslint.json" } as const;

const typeAwareObsidianRules = {
  "obsidianmd/no-plugin-as-component": "off",
  "obsidianmd/no-view-references-in-plugin": "off",
  "obsidianmd/no-unsupported-api": "off",
  "obsidianmd/prefer-file-manager-trash-file": "off",
  "obsidianmd/prefer-instanceof": "off",
} as const;

const currentCodebaseRules = {
  "@typescript-eslint/no-deprecated": "off",
  "@typescript-eslint/no-floating-promises": "off",
  "@typescript-eslint/no-unnecessary-type-assertion": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "obsidianmd/no-global-this": "off",
  "obsidianmd/prefer-window-timers": "off",
  "obsidianmd/settings-tab/no-problematic-settings-headings": "off",
  "obsidianmd/ui/sentence-case": "off",
} as const;

const jsonMetadataRules = {
  ...typeAwareObsidianRules,
  "@typescript-eslint/no-deprecated": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "depend/ban-dependencies": "off",
  "no-implicit-globals": "off",
  "no-irregular-whitespace": "off",
  "no-restricted-globals": "off",
  "no-restricted-imports": "off",
  "no-undef": "off",
  "obsidianmd/rule-custom-message": "off",
  "obsidianmd/ui/sentence-case": "off",
} as const;

export default defineConfig([
  {
    ignores: [".agents/", "main.js", "node_modules/", "coverage/", "v0-prototype/"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["*.config.mjs", "version-bump.mjs"],
    rules: typeAwareObsidianRules,
  },
  {
    files: ["*.config.mts", "*.config.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: typedParserOptions,
    },
    rules: {
      ...typeAwareObsidianRules,
      ...currentCodebaseRules,
    },
  },
  {
    files: ["package.json", "manifest.json", "versions.json"],
    language: "json/json",
    plugins: { json },
    rules: jsonMetadataRules,
  },
  {
    files: ["manifest.json", "versions.json"],
    ...json.configs.recommended,
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: typedParserOptions,
    },
    rules: {
      ...typeAwareObsidianRules,
      ...currentCodebaseRules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@microsoft/sdl/no-inner-html": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "no-unsanitized/property": "off",
      "obsidianmd/no-static-styles-assignment": "off",
      "obsidianmd/prefer-active-doc": "off",
    },
  },
]);
