import { createVec3F } from "./math.js";

export class EvalCtx {

    simulation = false;

    time = 0;

    get gravity() {
        const v = Math.min(2, this.time) / 2; //two seconds to warm up gravity
        return createVec3F(0, -9.81 * v, 0);
    }

    targetGravity = createVec3F(0, -9.81, 0);

}