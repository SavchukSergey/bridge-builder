import { Material } from "./material.mjs";

/** Heavy steel member: strong in tension and compression. */
export const steel = new Material({
  name: "steel",
  label: "Steel",
  density: 7850,
  crossSectionalArea: 0.04, // 20cm * 20cm
  youngModulus: 200000e6,
  tensileStrength: 400e6,
  compressionStrength: 250e6,
  costPerMeter: 200,
  look: { kind: "beam", color: "#4c5b69", highlight: "#7a8a99", width: 0.5, minPx: 4 },
});

/** A quarter of the section of {@link steel}, for lightly loaded members. */
export const lightSteel = new Material({
  name: "steel-light",
  label: "Light steel",
  density: 7850,
  crossSectionalArea: 0.01, // 10cm * 10cm
  youngModulus: 200000e6,
  tensileStrength: 400e6,
  compressionStrength: 250e6,
  costPerMeter: 70,
  look: { kind: "beam", color: "#6b7a87", highlight: "#9eabb6", width: 0.3, minPx: 2.5 },
});
