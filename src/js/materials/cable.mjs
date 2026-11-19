import { Material } from "./material.mjs";

/** High-strength steel wire rope: very strong in tension, useless in compression. */
export const cable = new Material({
  name: "cable",
  label: "Cable",
  density: 7850,
  crossSectionalArea: 0.0025, // ~56 mm diameter rope
  youngModulus: 160000e6, // wire rope is less stiff than solid steel
  tensileStrength: 1500e6,
  compressionStrength: 1500e6, // unused: cables go slack instead
  canCompress: false,
  costPerMeter: 60,
  look: { kind: "cable", color: "#25282c", width: 0.14, minPx: 2 },
});

/**
 * A winch: a cable on a drum that pulls itself in to lift a drawbridge, then lets out again.
 * As strong as {@link cable}, and dearer.
 */
export const winch = new Material({
  name: "winch",
  label: "Winch",
  density: 7850,
  crossSectionalArea: 0.0025,
  youngModulus: 160000e6,
  tensileStrength: 1500e6,
  compressionStrength: 1500e6,
  canCompress: false,
  costPerMeter: 150,
  winch: true,
  look: { kind: "cable", color: "#e0a21b", width: 0.18, minPx: 2.5 },
});

/** A fifth of the section of {@link cable} (~25 mm rope), for hangers and light stays. */
export const thinCable = new Material({
  name: "cable-thin",
  label: "Thin cable",
  density: 7850,
  crossSectionalArea: 0.0005,
  youngModulus: 160000e6,
  tensileStrength: 1500e6,
  compressionStrength: 1500e6,
  canCompress: false,
  costPerMeter: 20,
  look: { kind: "cable", color: "#474d55", width: 0.07, minPx: 1.2 },
});
