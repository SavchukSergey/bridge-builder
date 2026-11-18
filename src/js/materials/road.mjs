import { Material } from "./material.mjs";

/**
 * Concrete deck slab: heavy, decent in compression, weak in tension. Vehicles drive on it,
 * but it can't span a gap by hanging like a chain; it needs supports every few segments.
 */
export const road = new Material({
  name: "road",
  density: 2500,
  crossSectionalArea: 0.2, // e.g. 1 m wide x 20 cm slab
  youngModulus: 30000e6,
  tensileStrength: 30e6, // effective, with rebar: ~0.1% strain before failure
  compressionStrength: 30e6,
  costPerMeter: 300,
  drivable: true,
});
