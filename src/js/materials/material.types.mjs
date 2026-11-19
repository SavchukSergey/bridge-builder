/**
 * @typedef {Object} MaterialOpts
 * @property {number} youngModulus
 * @property {number} compressionStrength
 * @property {number} tensileStrength
 * @property {number} density
 * @property {number} crossSectionalArea
 * @property {string} name - stable id used in saved structures
 * @property {string} [label] - name shown to the player
 * @property {boolean} [canCompress] - false for cables/ropes: they go slack instead of resisting compression
 * @property {number} costPerMeter - price of one metre of link, counted against a level's budget
 * @property {"road" | "rail"} [carries] - a deck: road vehicles drive on road, trains run on rail
 * @property {MaterialLook} [look] - how links of this material are drawn
 * @property {boolean} [winch] - pulls itself in during a drawbridge's test, then lets out
 */

/**
 * @typedef {Object} MaterialLook
 * @property {"deck" | "beam" | "cable"} kind - concrete slab with a railing, steel member, or rope
 * @property {string} color - main colour (the slab's concrete for a deck)
 * @property {string} [highlight] - lighter centre line of a beam
 * @property {string} [surface] - road surface on top of a deck
 * @property {boolean} [track] - a deck with sleepers and a rail instead of a guard rail
 * @property {number} width - drawn width (m): slab depth for a deck, member width otherwise
 * @property {number} minPx - minimum width on screen, so thin members stay visible zoomed out
 */
