import { createVec3F } from "./math.js";

export class EvalCtx {

    simulation = false;

    time = 0;

    get gravity() {
        const v = Math.min(2, this.time) / 2; //two seconds to warm up gravity
        return createVec3F(0, -9.81 * v + this.quakeUp, 0);
    }

    targetGravity = createVec3F(0, -9.81, 0);

    /** The wind's push now, N per metre of member standing up into it (wind.mjs). */
    wind = 0;

    /** The ground's shove now in an earthquake, m/s² (quake.mjs). */
    quake = 0;

    /** What an earthquake's up and down shaking adds to gravity now, m/s² (quake.mjs). */
    quakeUp = 0;

}