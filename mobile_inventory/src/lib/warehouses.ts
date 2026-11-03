// Which warehouses a user should see.
//
// A site with several companies lists every company's warehouses from the same endpoint; showing a
// storekeeper another company's stores invites a move into stock they do not own. Warehouses that
// declare no company are kept, because some sites leave the field empty deliberately.

import type { Warehouse } from "./types";

export function warehousesForCompany(rows: Warehouse[], company?: string): Warehouse[] {
	if (!company) return rows;
	return rows.filter((row) => !row.company || row.company === company);
}
