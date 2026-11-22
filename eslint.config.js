import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["node_modules/", "uploads/", "data/", "coverage/"] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node },
        },
        rules: {
            // `const { secret, ...rest } = object` is how a field is left out on purpose.
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
        },
    },
];
