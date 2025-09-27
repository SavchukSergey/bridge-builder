import { Material } from "./material.mjs";

export const cable = new Material({
  name: "cable",
  density: 1000,
  crossSectionalArea: 0.001,
  youngModulus: 180000e6,
  tensileStrength: 200e6,
  compressionStrength: 0
});