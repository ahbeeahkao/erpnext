import js from "@eslint/js";
import globals from "globals";

export default [
	{
		ignores: ["node_modules/**", "audio/*.mp3"],
	},
	js.configs.recommended,
	{
		files: ["src/**/*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: { ...globals.browser },
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-console": "off",
		},
	},
	{
		files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: { ...globals.node },
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-console": "off",
		},
	},
];
