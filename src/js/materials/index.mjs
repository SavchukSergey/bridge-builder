import { cable } from "./cable.mjs";
import { road } from "./road.mjs";
import { steel } from "./steel.mjs";

/**
 * All materials by name. Saved structures reference materials by these names.
 * @type {Record<string, import("./material.mjs").Material>}
 */
export const materials = { road, steel, cable };
