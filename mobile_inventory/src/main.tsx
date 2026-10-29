import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container is missing");

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>
);

// The service worker only matters for the built app (offline shell + asset cache).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register("./sw.js").catch(() => {
			// A failed registration must never break the app; offline queue still works.
		});
	});
}
