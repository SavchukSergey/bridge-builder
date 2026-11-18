import { Material } from "./material.mjs";

export const cable = new Material({
  name: "cable",
  density: 1000,
  crossSectionalArea: 0.0025, // 5cm x 5cm
  youngModulus: 180000e6,
  tensileStrength: 200e6,
  compressionStrength: 200e6,
  canCompress: false,
});