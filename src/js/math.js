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
 * 
 * @param {Vec3F} vec 
 */
export function vec3flen(vec) {
  return Math.sqrt(vec3flen2(vec));
}


/**
 * 
 * @param {Vec3F} a 
 * @param {Vec3F} b 
 * @returns {Vec3F}
 */
export function vec3fsub(a, b) {
  return createVec3F(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * 
 * @param {Vec3F} a 
 * @param {Vec3F} b 
 * @returns {Vec3F}
 */
export function vec3fadd(a, b) {
  return createVec3F(a.x + b.x, a.y + b.y, a.z + b.z);
}

/**
 * 
 * @param {Vec3F} a 
 * @param {number} k
 * @returns {Vec3F}
 */
export function vec3fmul(a, k) {
  return createVec3F(a.x * k, a.y * k, a.z * k);
}

/**
 * 
 * @param {Vec3F} a 
 * @returns {Vec3F}
 */
export function vec3fnorm(a) {
  return vec3fmul(a, 1 / vec3flen(a));
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
 * @param {number} k - 0 for a-ish color, 1 for b-ish color
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