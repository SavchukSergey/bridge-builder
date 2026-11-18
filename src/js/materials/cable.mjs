import { Material } from "./material.mjs";

/** High-strength steel wire rope: very strong in tension, useless in compression. */
export const cable = new Material({
  name: "cable",
  density: 7850,
  crossSectionalArea: 0.0025, // ~56 mm diameter rope
  youngModulus: 160000e6, // wire rope is less stiff than solid steel
  tensileStrength: 1500e6,
  compressionStrength: 1500e6, // unused: cables go slack instead
  canCompress: false,
  costPerMeter: 60,
});
