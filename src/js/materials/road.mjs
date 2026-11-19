import { Material } from "./material.mjs";

/**
 * Concrete deck slab: heavy, decent in compression, weak in tension. Vehicles drive on it,
 * but it can't span a gap by hanging like a chain; it needs supports every few segments.
 */
export const road = new Material({
  name: "road",
  label: "Road",
  density: 2500,
  crossSectionalArea: 0.2, // e.g. 1 m wide x 20 cm slab
  youngModulus: 30000e6,
  tensileStrength: 30e6, // effective, with rebar: ~0.1% strain before failure
  compressionStrength: 30e6,
  costPerMeter: 300,
  carries: "road",
  look: { kind: "deck", color: "#b5afa4", surface: "#3d4045", width: 0.9, minPx: 6 },
});

/**
 * Railway deck: a steel girder with sleepers and a rail on top. Only trains run on it.
 * Lighter than the road slab and stronger in tension, but dearer.
 */
export const rail = new Material({
  name: "rail",
  label: "Rail",
  density: 7850,
  crossSectionalArea: 0.03,
  youngModulus: 200000e6,
  tensileStrength: 250e6,
  compressionStrength: 250e6,
  costPerMeter: 400,
  carries: "rail",
  look: { kind: "deck", color: "#56616c", surface: "#5b4a3a", width: 0.9, minPx: 6, track: true },
});
