/**
 * Scenery themes: the palette and the touches (sun or moon, trees or cacti, snow) that give
 * a level its look. Purely decorative.
 */

/**
 * @typedef {"summer" | "snow" | "desert" | "night"} ThemeId
 */

/**
 * @typedef {Object} Theme
 * @property {ThemeId} id
 * @property {[string, string, string]} sky - overhead, middle, at the horizon
 * @property {"sun" | "moon"} light
 * @property {string} cloud
 * @property {[[string, string], [string, string]]} hills - far and near layer: [foot, crest]
 * @property {[string, string, string]} valley - the far valley wall, from the rim down
 * @property {string} valleyRim
 * @property {[string, string]} water - surface, depths
 * @property {[string, string]} waterFront - translucent water in front: surface, depths
 * @property {string} ripple
 * @property {[string, string, string]} earth - cut ground, from the top down
 * @property {string} strata
 * @property {string} soil - the embankment under the road surface
 * @property {"forest" | "snowy forest" | "cacti"} flora
 * @property {number} dark - 0..1: how much the finished scene is darkened (night)
 */

/** @type {Record<ThemeId, Theme>} */
export const THEMES = {
  summer: {
    id: "summer",
    sky: ["#4a86c5", "#93bfe3", "#dcebf4"],
    light: "sun",
    cloud: "rgba(255, 255, 255, 0.85)",
    hills: [["#9db4c6", "#b6c9d6"], ["#6f8f68", "#8aa77d"]],
    valley: ["#a39886", "#8a7d6c", "#5f5448"],
    valleyRim: "#7d9a6c",
    water: ["#4f8fb0", "#1d4058"],
    waterFront: ["rgba(70, 130, 160, 0.55)", "rgba(25, 60, 85, 0.85)"],
    ripple: "rgba(220, 240, 250, 0.6)",
    earth: ["#8c7259", "#6e5643", "#4a3a2e"],
    strata: "rgba(50, 35, 25, 0.3)",
    soil: "#6b4d33",
    flora: "forest",
    dark: 0,
  },
  snow: {
    id: "snow",
    sky: ["#6f9cc8", "#b5cde2", "#e8eff5"],
    light: "sun",
    cloud: "rgba(250, 252, 255, 0.9)",
    hills: [["#a9b9c9", "#d3dee8"], ["#dfe7ee", "#f7fafc"]],
    valley: ["#b3b7bb", "#8f9499", "#62676c"],
    valleyRim: "#f2f6f9",
    water: ["#6a9fbf", "#20435c"],
    waterFront: ["rgba(110, 160, 190, 0.55)", "rgba(30, 65, 90, 0.85)"],
    ripple: "rgba(240, 248, 255, 0.7)",
    earth: ["#82786f", "#645a52", "#463e38"],
    strata: "rgba(40, 35, 32, 0.3)",
    soil: "#eef3f7", // snow banked against the road
    flora: "snowy forest",
    dark: 0,
  },
  desert: {
    id: "desert",
    sky: ["#4f8cc4", "#a9cbe0", "#f3e3c4"],
    light: "sun",
    cloud: "rgba(255, 253, 248, 0.7)",
    hills: [["#c8b69a", "#dccbb0"], ["#c58e5a", "#d9a874"]],
    valley: ["#c99b6c", "#a8744a", "#6e4a30"],
    valleyRim: "#cfa86e",
    water: ["#3f8f9e", "#1d4a55"],
    waterFront: ["rgba(60, 140, 150, 0.55)", "rgba(25, 70, 80, 0.85)"],
    ripple: "rgba(230, 250, 245, 0.55)",
    earth: ["#c47f4a", "#a3633a", "#6e3f25"],
    strata: "rgba(90, 45, 20, 0.3)",
    soil: "#9b6a40",
    flora: "cacti",
    dark: 0,
  },
  night: {
    id: "night",
    sky: ["#060d22", "#13254a", "#2f4570"],
    light: "moon",
    cloud: "rgba(150, 165, 195, 0.22)",
    hills: [["#253752", "#30455f"], ["#1d3328", "#284234"]],
    valley: ["#4d4a52", "#3c3a40", "#26252a"],
    valleyRim: "#2c4334",
    water: ["#2b4f6b", "#0c1c2a"],
    waterFront: ["rgba(40, 80, 110, 0.55)", "rgba(10, 25, 40, 0.85)"],
    ripple: "rgba(200, 215, 240, 0.45)",
    earth: ["#5a4a3d", "#44372d", "#2c231d"],
    strata: "rgba(20, 15, 10, 0.35)",
    soil: "#3d2d20",
    flora: "forest",
    dark: 0.38,
  },
};
