import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "https://prooflet.test/",
      },
    },
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
})
