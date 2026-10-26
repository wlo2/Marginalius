import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/", ".test-build/"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*", "esbuild.config.mjs", "test/*.ts"],
				},
			},
		},
	},
	{
		// These run in Node, not in Obsidian: Node modules and node:test's unawaited test() calls are expected.
		files: ["esbuild.config.mjs", "test/**"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/no-global-this": "off",
			"@typescript-eslint/no-floating-promises": "off",
		},
	},
]);
