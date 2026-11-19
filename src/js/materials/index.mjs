import { cable, thinCable, winch } from "./cable.mjs";
import { rail, road } from "./road.mjs";
import { lightSteel, steel } from "./steel.mjs";

/**
 * All materials by name. Saved structures reference materials by these names.
 * @type {Record<string, import("./material.mjs").Material>}
 */
export const materials = {
  road,
  steel,
  [lightSteel.name]: lightSteel,
  cable,
  [thinCable.name]: thinCable,
  rail,
  winch,
};
