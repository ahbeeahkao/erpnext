import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist/**", "node_modules/**"] },
	{
		files: ["**/*.{ts,tsx}"],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		languageOptions: {
			ecmaVersion: 2022,
			globals: { ...globals.browser, ...globals.serviceworker },
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-console": ["warn", { allow: ["warn", "error"] }],
		},
	},
	{
		files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
		extends: [js.configs.recommended],
		languageOptions: { ecmaVersion: 2022, globals: { ...globals.node } },
	}
);
