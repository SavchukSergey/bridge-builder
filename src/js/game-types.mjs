/**
 * Types shared by the game's layers and the page.
 */

/**
 * @typedef {DragState | ClickState | undefined} InteractionState
 */

/**
 * @typedef {Object} BestResult
 * @property {number} cost
 * @property {number} stars - 1 to 3
 */

/**
 * @typedef {Object} PlacementInfo
 * @property {{ x: number, y: number }} client - pointer position, for placing the readout
 * @property {string} label - material
 * @property {number} length - m, of one side when mirrored
 * @property {boolean} mirrored - the click also builds the mirror image
 * @property {number} cost - of everything the click adds
 * @property {number} remaining - budget left after it (negative: over)
 */

/**
 * @typedef {Object} TestResult
 * @property {"success" | "over-budget" | "failed"} kind - all trucks crossed within budget;
 *   crossed but the bridge costs too much; or a truck was lost
 * @property {number} stars - 0 unless kind is "success"
 * @property {number} cost
 * @property {number} budget
 * @property {{ two: number, three: number }} goals - star thresholds
 * @property {BestResult | undefined} best - best win on this level, including this one
 * @property {BestResult | undefined} previousBest
 * @property {boolean} newBest - this win beat the previous best (or is the first)
 * @property {"fell" | "crashed" | "hard landing" | "boat"} [reason] - how the first vehicle was
 *   lost, or "boat": the boat couldn't get through the drawbridge
 * @property {{ material: string, label: string, kind: "deck" | "beam" | "cable", mode: "tension" | "compression", time: number, x: number, y: number }} [failure]
 *   - failed: the first member to break, and how
 * @property {boolean} [roadAcross] - failed: whether road spanned the whole gap at the start
 * @property {number} broken - members that broke
 * @property {string | undefined} nextLevel - id of the following level, if any
 * @property {ChallengeResult[]} challenges - the level's challenges (met only in a win)
 */

/**
 * @typedef {Object} ChallengeResult
 * @property {string} id
 * @property {string} name
 * @property {string} label - what it asks for
 * @property {boolean} met - by this bridge, in this win
 * @property {boolean} earned - ever, including now
 * @property {boolean} isNew - met for the first time in this win
 */

/**
 * @typedef {Object} LinkInfo
 * @property {import("./math.js").Vec3F} client - pointer position, client pixels
 * @property {string} material - material id
 * @property {string} label - material name to show
 * @property {number} length - rest length, m
 * @property {number} cost
 * @property {"tension" | "compression" | "slack" | "unloaded"} state
 * @property {number} forceKN - magnitude of the axial force
 * @property {number} utilization - fraction of the material's strength in use now
 * @property {number | undefined} peakUtilization - highest since the simulation started
 */

/**
 * @typedef {Object} DragState
 * @property {import("./math.js").Vec3F} startGlobal 
 * @property {import("./math.js").Vec3F} startClient 
 * @property {import("./math.js").Vec3F} original 
 * @property {{ transformPoint(p: import("./math.js").Vec3F): import("./math.js").Vec3F }} clientToGlobal
 * @property {boolean} moved - pointer travelled past DRAG_THRESHOLD_PX
 * @property {JointMove[]} [moves] - joints being dragged (a free joint, and its mirror image),
 *   with where they started; panning if absent
 * @property {boolean} [cancelled] - Esc pressed: the drag is undone and ignored until release
 */

/**
 * @typedef {Object} JointMove
 * @property {import("./engine/joint.mjs").Joint} joint
 * @property {import("./math.js").Vec3F} start
 * @property {(target: import("./math.js").Vec3F) => import("./math.js").Vec3F} map - where
 *   this joint goes when the dragged one goes to target
 */

/**
 * @typedef {Object} ClickState
 * @property {import("./math.js").Vec3F} startGlobal 
 * @property {import("./math.js").Vec3F} startClient 
 * @property {import("./engine/joint.mjs").Joint} jointA
 * @property {import("./scene.js").CompositeScene} preview
 * @property {import("./scene.js").CompositeScene} previewBackup
 */

export {};
