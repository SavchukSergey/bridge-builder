import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { Grid } from "./grid.mjs";
import { cable } from "./materials/cable.mjs";
import { materials } from "./materials/index.mjs";
import { steel } from "./materials/steel.mjs";
import { createVec3F, vec3flen2, vec3fsub } from "./math.js";

const MAX_DT = 0.0005;
/** Fraction of the theoretical stability limit actually used. */
const STABILITY_SAFETY = 0.5;

/** Version of the saved-structure JSON format produced by {@link Scene#serialize}. */
export const SAVE_FORMAT_VERSION = 1;

export class Scene {

  get joints() {
    return this.content.joints;
  }

  get links() {
    return this.content.links;
  }

  content = new CompositeScene();
  preview = new CompositeScene();

  grid = new Grid();

  constructor() {
    this.loadDefault();
  }

  /** Replaces the structure with the built-in demo suspension bridge. */
  loadDefault() {
    this.content = new CompositeScene();
    const jointAO = new Joint(createVec3F(-50, 10, 0), true);
    const jointAI = new Joint(createVec3F(-40, 10, 0), true);
    this.joints.push(jointAO, jointAI);

    const jointBI = new Joint(createVec3F(40, 10, 0), true);
    const jointBO = new Joint(createVec3F(50, 10, 0), true);
    this.joints.push(jointBI, jointBO);

    const jointAH = new Joint(createVec3F(-40, 20, 0));
    const jointBH = new Joint(createVec3F(40, 20, 0));
    this.joints.push(jointAH, jointBH);

    this.links.push(new Link(jointAI, jointAH, steel));
    this.links.push(new Link(jointBI, jointBH, steel));

    this.links.push(new Link(jointAH, jointAO, steel));
    this.links.push(new Link(jointBH, jointBO, steel));

    const ropeJoints = [
      new Joint(createVec3F(-30, 20, 0)),
      new Joint(createVec3F(-20, 20, 0)),
      new Joint(createVec3F(-10, 20, 0)),
      new Joint(createVec3F(0, 20, 0)),
      new Joint(createVec3F(10, 20, 0)),
      new Joint(createVec3F(20, 20, 0)),
      new Joint(createVec3F(30, 20, 0)),
    ];
    const ropeLinks = [
      new Link(jointAH, ropeJoints[0], cable),
      new Link(ropeJoints[0], ropeJoints[1], cable),
      new Link(ropeJoints[1], ropeJoints[2], cable),
      new Link(ropeJoints[2], ropeJoints[3], cable),
      new Link(ropeJoints[3], ropeJoints[4], cable),
      new Link(ropeJoints[4], ropeJoints[5], cable),
      new Link(ropeJoints[5], ropeJoints[6], cable),
      new Link(ropeJoints[6], jointBH, cable),
    ]

    const bridgeJoints = [
      new Joint(createVec3F(-30, 10, 0)),
      new Joint(createVec3F(-20, 10, 0)),
      new Joint(createVec3F(-10, 10, 0)),
      new Joint(createVec3F(0, 10, 0)),
      new Joint(createVec3F(10, 10, 0)),
      new Joint(createVec3F(20, 10, 0)),
      new Joint(createVec3F(30, 10, 0)),
    ];

    const bridgeLinks = [
      new Link(jointAI, bridgeJoints[0], steel),
      new Link(bridgeJoints[0], bridgeJoints[1], steel),
      new Link(bridgeJoints[1], bridgeJoints[2], steel),
      new Link(bridgeJoints[2], bridgeJoints[3], steel),
      new Link(bridgeJoints[3], bridgeJoints[4], steel),
      new Link(bridgeJoints[4], bridgeJoints[5], steel),
      new Link(bridgeJoints[5], bridgeJoints[6], steel),
      new Link(bridgeJoints[6], jointBI, steel),
    ]

    this.joints.push(...ropeJoints);
    this.links.push(...ropeLinks);
    this.joints.push(...bridgeJoints);
    this.links.push(...bridgeLinks);

    for (let i = 0; i < ropeJoints.length; i++) {
      this.links.push(new Link(ropeJoints[i], bridgeJoints[i], cable));
    }

    this.distributeMass();
  }

  /**
   * Nearest unbroken link whose segment passes within maxDist of pos.
   * @param {import("./math.js").Vec3F} pos
   * @param {number} maxDist
   * @returns {Link | undefined}
   */
  findLink(pos, maxDist) {
    let result = undefined;
    let resultDist2 = maxDist * maxDist;
    for (const link of this.links) {
      if (link.broken) continue;
      const ab = vec3fsub(link.b.position, link.a.position);
      const ap = vec3fsub(pos, link.a.position);
      const len2 = vec3flen2(ab);
      const t = len2 ? Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2)) : 0;
      const closest = createVec3F(ab.x * t, ab.y * t, ab.z * t);
      const dist2 = vec3flen2(vec3fsub(ap, closest));
      if (dist2 < resultDist2) {
        result = link;
        resultDist2 = dist2;
      }
    }
    return result;
  }

  /**
   * @param {Joint} a
   * @param {Joint} b
   */
  hasLink(a, b) {
    return this.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }

  /**
   * Removes a link, plus any non-fixed joints left without links.
   * @param {Link} link
   */
  removeLink(link) {
    this.content.links = this.links.filter(l => l !== link);
    this.__removeOrphans([link.a, link.b]);
    this.distributeMass();
  }

  /**
   * Removes a non-fixed joint with all its links (and joints orphaned by that).
   * Fixed anchors cannot be removed.
   * @param {Joint} joint
   * @returns {boolean} true if removed
   */
  removeJoint(joint) {
    if (joint.fixed) return false;
    const neighbours = [];
    this.content.links = this.links.filter(l => {
      if (l.a === joint) { neighbours.push(l.b); return false; }
      if (l.b === joint) { neighbours.push(l.a); return false; }
      return true;
    });
    this.content.joints = this.joints.filter(j => j !== joint);
    this.__removeOrphans(neighbours);
    this.distributeMass();
    return true;
  }

  /**
   * @param {Joint[]} candidates
   */
  __removeOrphans(candidates) {
    const orphans = candidates.filter(j => !j.fixed && !this.links.some(l => l.a === j || l.b === j));
    if (orphans.length) {
      this.content.joints = this.joints.filter(j => !orphans.includes(j));
    }
  }

  /**
   * 
   * @param {import("./math.js").Vec3F} pos 
   * @param {number} maxDist 
   * @returns 
   */
  findJoint(pos, maxDist) {
    /**
     * @type {Joint | undefined}
     */
    let result = undefined;
    let resultDist2 = maxDist * maxDist;
    for (const joint of this.joints) {
      const dist2 = vec3flen2(vec3fsub(joint.position, pos));
      if (dist2 < resultDist2) {
        result = joint;
        resultDist2 = dist2;
      }
    }
    return result;
  }

  /**
   * 
 * @param {import("./render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    this.grid.render(ctx);
    this.content.render(ctx);
    this.preview.render(ctx);
  }

  distributeMass() {
    this.content.distributeMass();
  }

  /**
   * Converts the structure to plain JSON. Positions come from the snapshot, so pass the
   * pre-simulation snapshot to save the structure as built rather than as deformed.
   * @param {SceneSnapshot} [snapshot]
   * @returns {SavedStructure}
   */
  serialize(snapshot = this.snapshot()) {
    /** @type {Map<Joint, number>} */
    const index = new Map();
    const joints = snapshot.joints.map(({ joint, position }, i) => {
      index.set(joint, i);
      /** @type {SavedJoint} */
      const saved = { x: position.x, y: position.y };
      if (joint.fixed) saved.fixed = true;
      return saved;
    });
    const links = snapshot.links.map(({ link }) => ({
      a: /** @type {number} */ (index.get(link.a)),
      b: /** @type {number} */ (index.get(link.b)),
      material: link.material.name,
    }));
    return { version: SAVE_FORMAT_VERSION, joints, links };
  }

  /**
   * Replaces the structure with a saved one. Validates fully before changing anything.
   * @param {unknown} data
   * @throws {Error} if the data is not a valid saved structure
   */
  load(data) {
    const fail = (/** @type {string} */ msg) => { throw new Error(`Invalid structure: ${msg}`); };
    const d = /** @type {any} */ (data);
    if (!d || typeof d !== "object") fail("not an object");
    if (d.version !== SAVE_FORMAT_VERSION) fail(`unsupported version ${d.version}`);
    if (!Array.isArray(d.joints) || !Array.isArray(d.links)) fail("missing joints or links");

    const joints = d.joints.map((/** @type {any} */ j, /** @type {number} */ i) => {
      if (!j || !Number.isFinite(j.x) || !Number.isFinite(j.y)) fail(`joint ${i} has bad coordinates`);
      return new Joint(createVec3F(j.x, j.y, 0), j.fixed === true);
    });
    const links = d.links.map((/** @type {any} */ l, /** @type {number} */ i) => {
      const a = joints[l?.a], b = joints[l?.b];
      if (!Number.isInteger(l?.a) || !Number.isInteger(l?.b) || !a || !b) fail(`link ${i} references a missing joint`);
      if (a === b) fail(`link ${i} connects a joint to itself`);
      const material = Object.hasOwn(materials, l.material) ? materials[l.material] : undefined;
      if (!material) fail(`link ${i} has unknown material "${l.material}"`);
      if (vec3flen2(vec3fsub(a.position, b.position)) === 0) fail(`link ${i} has zero length`);
      return new Link(a, b, /** @type {import("./materials/material.mjs").Material} */ (material));
    });

    this.content = new CompositeScene();
    this.content.joints = joints;
    this.content.links = links;
    this.distributeMass();
  }

  /**
   * Captures the built structure so it can be restored after a simulation run.
   * @returns {SceneSnapshot}
   */
  snapshot() {
    return {
      joints: this.joints.map(joint => ({
        joint,
        position: { ...joint.position },
        velocity: { ...joint.velocity },
      })),
      links: this.links.map(link => ({ link, broken: link.broken })),
    };
  }

  /**
   * @param {SceneSnapshot} snapshot
   */
  restore(snapshot) {
    this.content.joints = snapshot.joints.map(({ joint, position, velocity }) => {
      joint.position = { ...position };
      joint.velocity = { ...velocity };
      joint.force = createVec3F(0, 0, 0);
      return joint;
    });
    this.content.links = snapshot.links.map(({ link, broken }) => {
      link.broken = broken;
      link.preEval();
      return link;
    });
    this.distributeMass();
  }

  /**
   * 
   * @param {import("./eval-ctx.mjs").EvalCtx} evalCtx 
   */
  tick(evalCtx) {
    for (const joint of this.joints) {
      joint.force.x = 0;
      joint.force.y = 0;
      joint.force.z = 0;
    }
    this.distributeMass();
    for (const joint of this.joints) {
      joint.force.x = evalCtx.gravity.x * joint.mass;
      joint.force.y = evalCtx.gravity.y * joint.mass;
      joint.force.z = evalCtx.gravity.z * joint.mass;
    }
    for (const link of this.links) {
      if (!link.broken) {
        link.preEval();
        const { a, b } = link;

        const force = link.stressForce;
        const fx = link.directionN.x * force;
        const fy = link.directionN.y * force;
        const fz = link.directionN.z * force;
        a.force.x += fx;
        a.force.y += fy;
        a.force.z += fz;
        b.force.x -= fx;
        b.force.y -= fy;
        b.force.z -= fz;
      }
    }

    for (const link of this.links) {
      if (link.broken) continue;
      const { a, b } = link;
      const va = a.velocity;
      const vb = b.velocity;
      const rvx = vb.x - va.x;
      const rvy = vb.y - va.y;
      const rvz = vb.z - va.z;
      const vrel = rvx * link.directionN.x + rvy * link.directionN.y + rvz * link.directionN.z;
      const dampingForce = vrel * 0.1;
      const dfx = link.directionN.x * dampingForce;
      const dfy = link.directionN.y * dampingForce;
      const dfz = link.directionN.z * dampingForce;
      a.force.x += dfx;
      a.force.y += dfy;
      a.force.z += dfz;
      b.force.x -= dfx;
      b.force.y -= dfy;
      b.force.z -= dfz;
    }

    let maxAcc2 = 0;
    for (const joint of this.joints) {
      if (joint.mass && !joint.fixed) {
        const accLength2 = vec3flen2(joint.force) / joint.mass;
        maxAcc2 = Math.max(accLength2, maxAcc2);
      }
    }
    const maxAcc = Math.sqrt(maxAcc2);

    const accDt = maxAcc ? Math.max(50 / maxAcc, 0.00001) : MAX_DT;
    const dt = Math.min(MAX_DT, accDt, this.stableDt());
    evalCtx.time += dt;
    const viscosity = Math.pow(0.99, dt);

    for (const joint of this.joints) {
      if (!joint.fixed && joint.mass) {
        const accX = joint.force.x / joint.mass;
        const accY = joint.force.y / joint.mass;
        const accZ = joint.force.z / joint.mass;
        // Semi-implicit (symplectic) Euler: update velocity, then move with the new velocity.
        joint.velocity.x += accX * dt;
        joint.velocity.y += accY * dt;
        joint.velocity.z += accZ * dt;
        joint.position.x += joint.velocity.x * dt;
        joint.position.y += joint.velocity.y * dt;
        joint.position.z += joint.velocity.z * dt;

        joint.velocity.x *= viscosity;
        joint.velocity.y *= viscosity;
        joint.velocity.z *= viscosity;
      }
    }

    for (const link of this.links) {
      if (!link.broken && link.overStressed) {
        link.broken = true;
      }
    }
    return dt;
  }

  /**
   * Largest timestep for which explicit integration of the stiffest link stays stable.
   * A link is a spring k = E*A/L between two masses; symplectic Euler is stable for
   * dt < 2/omega with omega = sqrt(k * (1/ma + 1/mb)). Short or light links are stiffer.
   */
  stableDt() {
    let maxOmega2 = 0;
    for (const link of this.links) {
      if (link.broken) continue;
      const invMassA = link.a.fixed || !link.a.mass ? 0 : 1 / link.a.mass;
      const invMassB = link.b.fixed || !link.b.mass ? 0 : 1 / link.b.mass;
      const k = link.material.youngModulus * link.crossSectionalArea / link.length;
      maxOmega2 = Math.max(maxOmega2, k * (invMassA + invMassB));
    }
    return maxOmega2 ? STABILITY_SAFETY * 2 / Math.sqrt(maxOmega2) : MAX_DT;
  }
}

/**
 * @typedef {Object} SavedJoint
 * @property {number} x
 * @property {number} y
 * @property {boolean} [fixed]
 */

/**
 * @typedef {Object} SavedStructure
 * @property {number} version
 * @property {SavedJoint[]} joints
 * @property {{ a: number, b: number, material: string }[]} links - a/b are indices into joints
 */

/**
 * @typedef {Object} SceneSnapshot
 * @property {{ joint: Joint, position: import("./math.js").Vec3F, velocity: import("./math.js").Vec3F }[]} joints
 * @property {{ link: Link, broken: boolean }[]} links
 */

export class CompositeScene {
  /** @type {Joint[]} */
  joints = [];

  /** @type {Link[]} */
  links = [];

  /**
   * 
 * @param {import("./render-ctx.mjs").RenderCtx} ctx 
   */
  render(ctx) {
    for (const joint of this.joints) {
      if (joint.fixed || joint.mass) {
        joint.render(ctx);
      }
    }
    for (const link of this.links) {
      if (!link.broken) {
        link.render(ctx);
      }
    }
  }

  distributeMass() {
    for (const joint of this.joints) {
      joint.mass = 0;
    }
    for (const link of this.links) {
      if (!link.broken) {
        link.a.mass += link.mass / 2;
        link.b.mass += link.mass / 2;
      }
    }
  }

}