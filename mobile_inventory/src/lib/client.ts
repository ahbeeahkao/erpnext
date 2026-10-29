import { FrappeClient } from "./api";
import { DemoClient } from "./demo";
import type { InventoryClient, Session } from "./types";

export function createClient(session: Session): InventoryClient {
	return session.mode === "demo" ? new DemoClient() : new FrappeClient(session);
}
