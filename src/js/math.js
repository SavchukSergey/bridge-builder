/**
 * @typedef {{ x: number, y: number, z: number}} Vec3F
 */

/**
 * 
 * @param {number} x 
 * @param {number} y 
 * @param {number} z
 * @returns {Vec3F}
 */
export function createVec3F(x, y, z) {
  return { x, y, z };
}

/**
 * 
 * @param {Vec3F} vec 
 */
export function vec3flen2(vec) {
  return vec.x * vec.x + vec.y * vec.y + vec.z * vec.z;
}

/**
 * @typedef {Object} Color
 * @property {number} r
 * @property {number} g
 * @property {number} b
 */

/**
 * 
 * @param {Color} a 
 * @param {Color} b 
 * @param {number} k 
 * @returns {Color}
 */
export function lerpColor(a, b, k) {
  k = Math.max(0, k);
  k = Math.min(1, k);
  return {
    r: a.r * (1 - k) + b.r * k,
    g: a.g * (1 - k) + b.g * k,
    b: a.b * (1 - k) + b.b * k,
  };
}