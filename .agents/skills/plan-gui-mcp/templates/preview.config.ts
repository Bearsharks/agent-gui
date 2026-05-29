export default {
  entries: [".agent-gui/previews/**/*.preview.tsx"],
  // Optional prototype setup:
  // setup: ".agent-gui/preview.setup.tsx",
  // styles: ["src/styles/tokens.css"],
  // aliases: {
  //   "@": "./src",
  // },
  // publicDir: "public",
  devServer: {
    host: "127.0.0.1",
    port: 5174,
  },
  // Enable polling when file events are unreliable, such as Docker, WSL, or network volumes.
  // watch: {
  //   usePolling: true,
  //   interval: 100,
  // },
};
