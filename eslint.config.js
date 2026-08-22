// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "src/generated/**", "web/**"],
  },
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Mechanical enforcement of the module contract: a module may reach a
    // sibling module only through its published `*.public.ts` surface (not
    // used by auth/qr yet, but available to future modules) or the event
    // bus — never another module's repository.ts / service.ts / etc.
    // directly. Reaching into core is unrestricted (core is the shared
    // substrate every module builds on).
    files: ["src/modules/*/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Exactly one '../' (a sibling module's directory, not '../../'
              // which escapes past src/modules/ into core or shared) followed
              // by anything that isn't a *.public.ts surface. `group`'s
              // gitignore-style globs can't express "not two levels up" (its
              // `*` matches the literal string ".." like any other segment
              // name), so this needs a real regex instead.
              regex: "^\\.\\./(?!\\.\\./)[^/]+/(?!.*\\.public\\.(?:js|ts)$).+$",
              message:
                "Modules may not import another module's internals directly. Use the shared eventBus, " +
                "or have the other module publish an explicit *.public.ts surface.",
            },
            {
              // Same rule for a module with its own subfolders reaching a
              // sibling via a longer '../../modules/<name>/...' path.
              regex: "^(?:\\.\\./)+modules/[^/]+/(?!.*\\.public\\.(?:js|ts)$).+$",
              message:
                "Modules may not import another module's internals directly. Use the shared eventBus, " +
                "or have the other module publish an explicit *.public.ts surface.",
            },
          ],
        },
      ],
    },
  },
);
