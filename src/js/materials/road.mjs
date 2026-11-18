import { Material } from "./material.mjs";

/** Steel-reinforced deck: structurally like steel, but vehicles can drive on it. */
export const road = new Material({
  name: "road",
  density: 7850,
  crossSectionalArea: 0.04, // 20cm x 20cm
  youngModulus: 200000e6,
  tensileStrength: 400e6,
  compressionStrength: 250e6,
  costPerMeter: 300,
  drivable: true,
});
