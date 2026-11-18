/**
 * @typedef {Object} MaterialOpts
 * @property {number} youngModulus
 * @property {number} compressionStrength
 * @property {number} tensileStrength
 * @property {number} density
 * @property {number} crossSectionalArea
 * @property {string} name
 * @property {boolean} [canCompress] - false for cables/ropes: they go slack instead of resisting compression
 * @property {number} costPerMeter - price of one metre of link, counted against a level's budget
 * @property {boolean} [drivable] - vehicles can drive on links of this material
*/
