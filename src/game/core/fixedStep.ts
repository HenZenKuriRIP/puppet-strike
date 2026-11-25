/** Fixed-timestep accumulator (Gaffer-style). Pure & testable. */
export class FixedStepper {
  acc = 0;
  constructor(public dt: number, public maxSteps = 5) {}
  /** returns number of fixed steps to run this frame */
  advance(frameDt: number): number {
    this.acc += Math.min(frameDt, this.dt * this.maxSteps);
    let n = 0;
    while (this.acc >= this.dt && n < this.maxSteps) { this.acc -= this.dt; n++; }
    return n;
  }
  get alpha() { return this.acc / this.dt; }
}
