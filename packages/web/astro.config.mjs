import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react(), tailwind()],
  server: { port: 4321 },
});
