import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build can be dropped in at any path:
//   /assets/mobile_inventory/  (site assets) or a custom www route.
export default defineConfig({
	base: "./",
	plugins: [react()],
	server: {
		host: "0.0.0.0",
		port: 5173,
		strictPort: true,
		// the sandbox/browser preview is served from a proxied host
		allowedHosts: true,
	},
	preview: {
		host: "0.0.0.0",
		port: 4173,
		strictPort: true,
		allowedHosts: true,
	},
	build: {
		target: "es2020",
		sourcemap: true,
	},
});
