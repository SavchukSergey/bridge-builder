import { Joint } from "./engine/joint.mjs";
import { Link } from "./engine/link.mjs";
import { Grid } from "./grid.mjs";
import { cable } from "./materials/cable.mjs";
import { steel } from "./materials/steel.mjs";
import { createVec3F, vec3flen2, vec3fsub } from "./math.js";

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

    const dt = maxAcc ? Math.max(Math.min(50 / maxAcc, 0.0005), 0.00001) : 0.0005;
    evalCtx.time += dt;
    const viscosity = Math.pow(0.99, dt);

    const dt2 = dt * dt * 0.5;

    for (const joint of this.joints) {
      if (!joint.fixed && joint.mass) {
        const accX = joint.force.x / joint.mass;
        const accY = joint.force.y / joint.mass;
        const accZ = joint.force.z / joint.mass;
        joint.velocity.x += accX * dt;
        joint.velocity.y += accY * dt;
        joint.velocity.z += accZ * dt;
        joint.position.x += joint.velocity.x * dt + accX * dt2;
        joint.position.y += joint.velocity.y * dt + accY * dt2;
        joint.position.z += joint.velocity.z * dt + accZ * dt2;

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
  }
}

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