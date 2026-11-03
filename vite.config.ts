import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "ui-lab", specifier: "./lint/design-tokens.js" },
    ],
    ignorePatterns: [".agents/**", ".claude/**"],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "ui-lab/design-tokens": "error",
      "ui-lab/fluid-hover": "error",
      "ui-lab/press-animation": "error",
      "ui-lab/motion-tokens": "error",
      "no-restricted-imports": ["error", { paths: ["lucide-react"] }],
    },
    options: { typeAware: true, typeCheck: true },
  },
});
