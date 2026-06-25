import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201a",
        mint: "#d9f99d",
        jade: "#0f766e",
        coral: "#f97364",
        paper: "#f8faf7"
      }
    }
  },
  plugins: []
};

export default config;

