import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  root: path.resolve(import.meta.dirname),
  test: {
    include: [
      "client/src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "server/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "shared/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
  },
});
