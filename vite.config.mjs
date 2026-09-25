import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    rolldownOptions: {
      input: {
        studio: "index.html",
        pet: "pet.html",
        neoburie: "neoburie.html",
        companion: "companion.html",
      },
    },
  },
  server: { host: "127.0.0.1" },
});
