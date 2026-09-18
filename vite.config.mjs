import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    rolldownOptions: { input: { studio: "index.html", pet: "pet.html" } },
  },
  server: { host: "127.0.0.1" },
});
