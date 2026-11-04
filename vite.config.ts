import { readFileSync } from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const readDesignDoc = () => readFileSync(path.resolve(import.meta.dirname, "DESIGN.md"), "utf8");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "design-doc",
      configureServer(server) {
        server.middlewares.use("/design.md", (_req, res) => {
          res.setHeader("Content-Type", "text/markdown; charset=utf-8");
          res.end(readDesignDoc());
        });
      },
      generateBundle() {
        // Hosts may serve .md without a charset, and browsers then garble × and −. A BOM forces UTF-8.
        this.emitFile({ type: "asset", fileName: "design.md", source: `﻿${readDesignDoc()}` });
      },
    },
  ],
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
