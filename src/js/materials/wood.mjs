import { Material } from "./material.mjs";

/**
 * A timber beam, 20 x 20 cm: the cheapest piece per metre, light, and a fair bit weaker than
 * light steel (a third of its push and half its pull), and bendier. Per dollar of strength
 * it is a little dearer than light steel, so it doesn't make the levels cheaper: it's for
 * short, lightly loaded pieces and for building in wood.
 */
export const wood = new Material({
  name: "wood",
  label: "Wood",
  density: 600,
  crossSectionalArea: 0.04,
  youngModulus: 11000e6,
  tensileStrength: 30e6,
  compressionStrength: 20e6,
  costPerMeter: 30,
  look: { kind: "beam", color: "#9a6a3c", highlight: "#c39363", width: 0.45, minPx: 3 },
});
