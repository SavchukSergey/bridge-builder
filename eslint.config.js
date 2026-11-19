import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,mjs}"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.browser },
  },
  {
    files: ["test/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
  },
  {
    rules: {
      // underscore-prefixed names are deliberately unused (e.g. a callback's ignored argument)
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
