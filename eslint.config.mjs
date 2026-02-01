import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier/recommended";
import importPlugin from "eslint-plugin-import";

export default [
  {
    ignores: ["dist/**", "tools/**", "rollup.config.mjs", "eslint.config.mjs", "test/setup-mocha.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      // Import rules
      ...importPlugin.configs.errors.rules,
      ...importPlugin.configs.warnings.rules,
      ...importPlugin.configs.typescript.rules,

      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/consistent-type-definitions": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-member-accessibility": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // "@typescript-eslint/no-parameter-properties": "off", // Deprecated/Removed in v8?
      // "@typescript-eslint/max-classes-per-file": "off",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-shadow": "off",
      // "@typescript-eslint/unified-signatures": "error",
      // "arrow-parens": ["off", "as-needed"], // Handled by Prettier
      camelcase: "error",
      complexity: "off",
      "dot-notation": "error",
      // "eol-last": "off", // Handled by Prettier
      eqeqeq: ["error", "smart"],
      "guard-for-in": "off",
      "id-blacklist": [
        "error",
        "any",
        "Number",
        "number",
        "String",
        "string",
        "Boolean",
        "boolean",
        "Undefined",
      ],
      "id-match": "error",
      // "linebreak-style": "off", // Handled by Prettier
      "max-classes-per-file": ["error", 1],
      // "new-parens": "off", // Handled by Prettier
      // "newline-per-chained-call": "off", // Handled by Prettier
      "no-bitwise": "error",
      "no-caller": "error",
      "no-cond-assign": "error",
      "no-console": "off",
      "no-eval": "error",
      "no-invalid-this": "off",
      // "no-multiple-empty-lines": "off", // Handled by Prettier
      "no-new-wrappers": "error",
      "no-shadow": ["error", { hoist: "all" }],
      "no-throw-literal": "error",
      // "no-trailing-spaces": "off", // Handled by Prettier
      "no-undef-init": "error",
      "no-underscore-dangle": "warn",
      "no-var": "error",
      "object-shorthand": "error",
      "one-var": ["error", "never"],
      // "quote-props": "off", // Handled by Prettier
      radix: "error",
      "sort-imports": "warn",
      "spaced-comment": "error",
    },
  }
];
