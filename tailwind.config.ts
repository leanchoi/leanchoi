import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        trello: {
          blue: "#0052cc",
          darkblue: "#003f99",
          bg: "#1d2125",
          card: "#22272b",
          list: "#101204",
          listbg: "#f1f2f4",
        },
      },
    },
  },
  plugins: [],
};
export default config;
