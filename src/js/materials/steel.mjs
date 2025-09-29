import { Material } from "./material.mjs";

export const steel = new Material({
  name: "steel",
  density: 7850,
  crossSectionalArea: 0.04, // 20cm * 20cm
  youngModulus: 200000e6,
  tensileStrength: 400e6,
  compressionStrength: 250e6,
});