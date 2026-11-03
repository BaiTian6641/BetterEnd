/**
 * Vanilla/Java-accurate Elytra flight model used by the BetterEnd Armored and Crystalite Elytra.
 *
 * Bedrock has no item component that makes a custom item glide (only the hard-coded
 * `minecraft:elytra` does), so the runtime drives the player's velocity from this model every game
 * tick. The equations are Java `LivingEntity.updateFallFlyingMovement` and
 * `FireworkRocketEntity` boosting, with BCLib's per-item `getMovementFactor()` (Armored `0.97`,
 * Crystalite `1.0`) replacing the vanilla horizontal drag of `0.99`
 * (see `CrystaliteElytraGameTest.java`).
 *
 * Pure functions, no `@minecraft/server` or Node imports.
 */

export const ELYTRA_GRAVITY = 0.08;
export const ELYTRA_VANILLA_HORIZONTAL_DRAG = 0.99;
export const ELYTRA_VERTICAL_DRAG = 0.98;

/** `getMovementFactor()` of the Java items (`EndEquipmentItems`). */
export const ELYTRA_MOVEMENT_FACTORS = Object.freeze({
  elytra_armored: 0.97,
  elytra_crystalite: 1.0
});

/**
 * Advances one gliding tick.
 *
 * @param {{x:number,y:number,z:number}} vel velocity used for the previous move (blocks/tick)
 * @param {{x:number,y:number,z:number}} look unit view direction
 * @param {{movementFactor?:number, boosting?:boolean}} [options]
 * @returns {{x:number,y:number,z:number}} velocity for this tick's move
 */
export function stepElytraGlide(vel, look, { movementFactor = ELYTRA_VANILLA_HORIZONTAL_DRAG, boosting = false } = {}) {
  let { x, y, z } = vel;

  if (boosting) {
    // FireworkRocketEntity.tick: pull the velocity towards 1.5x the look vector.
    x += look.x * 0.1 + (look.x * 1.5 - x) * 0.5;
    y += look.y * 0.1 + (look.y * 1.5 - y) * 0.5;
    z += look.z * 0.1 + (look.z * 1.5 - z) * 0.5;
  }

  const lookHorizontal = Math.hypot(look.x, look.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, look.y))); // Java xRot: positive looks down
  const moveHorizontal = Math.hypot(x, z);
  const lift = Math.cos(pitch) * Math.cos(pitch);

  y += ELYTRA_GRAVITY * (-1 + lift * 0.75);

  if (y < 0 && lookHorizontal > 0) {
    const d = y * -0.1 * lift;
    x += (look.x * d) / lookHorizontal;
    y += d;
    z += (look.z * d) / lookHorizontal;
  }
  if (pitch < 0 && lookHorizontal > 0) {
    const d = moveHorizontal * -Math.sin(pitch) * 0.04;
    x += (-look.x * d) / lookHorizontal;
    y += d * 3.2;
    z += (-look.z * d) / lookHorizontal;
  }
  if (lookHorizontal > 0) {
    x += ((look.x / lookHorizontal) * moveHorizontal - x) * 0.1;
    z += ((look.z / lookHorizontal) * moveHorizontal - z) * 0.1;
  }

  return {
    x: x * movementFactor,
    y: y * ELYTRA_VERTICAL_DRAG,
    z: z * movementFactor
  };
}

/** Java `FireworkRocketEntity` lifetime: `10 * flight + nextInt(6) + nextInt(7)` ticks. */
export function fireworkBoostTicks(flightDuration = 1, random = Math.random) {
  return 10 * Math.max(1, flightDuration) + Math.floor(random() * 6) + Math.floor(random() * 7);
}

/** Java `LivingEntity.travel` fly-into-wall damage: `(speedBefore - speedAfter) * 10 - 3`. */
export function elytraKineticDamage(horizontalSpeedBefore, horizontalSpeedAfter) {
  return Math.max(0, (horizontalSpeedBefore - horizontalSpeedAfter) * 10 - 3);
}

const CORRECTION_GAIN = 0.5;
const CORRECTION_LIMIT = 1.2;
const IMPULSE_LIMIT = 3;

const clampValue = (v, limit) => Math.max(-limit, Math.min(limit, v));

/**
 * Closed-loop driver that makes a Bedrock player *move like the Java elytra model*.
 *
 * The script can only set the player's velocity; the engine then applies its own friction and
 * gravity before/after the move, in an order we cannot observe. Instead of assuming it, the
 * controller keeps the intended Java velocity (`model`) and a per-axis integral `bias`: each tick the
 * error between the displacement it asked for (`aim`) and the displacement the engine actually
 * delivered (`measured`) is fed back, so the delivered motion converges to the Java trajectory for
 * *any* engine damping order and one tick of latency (the loop is stable for gain 0.5).
 *
 * Collisions (delivered speed far below the aim) reset the model to reality and report Java's
 * fly-into-wall damage; large external boosts (vents, bouncy blocks) are adopted as the new model.
 */
export class ElytraGlideController {
  constructor() {
    this.reset();
  }

  reset() {
    this.model = null;
    this.aim = null;
    this.bias = { x: 0, y: 0, z: 0 };
  }

  /**
   * @param {object} input
   * @param {{x:number,y:number,z:number}} input.measured displacement of the last tick
   * @param {{x:number,y:number,z:number}} input.engineVelocity velocity the engine will move with next
   * @param {{x:number,y:number,z:number}} input.look unit view direction
   * @param {number} input.movementFactor BCLib movement factor (horizontal drag)
   * @param {boolean} input.boosting a firework rocket is attached
   * @param {boolean} input.started first tick of a glide
   * @returns {{impulse:{x:number,y:number,z:number}, wallDamage:number, model:object}}
   */
  step({ measured, engineVelocity, look, movementFactor, boosting, started }) {
    let wallDamage = 0;
    if (started || !this.model) {
      this.model = { x: measured.x, y: measured.y, z: measured.z };
      this.bias = { x: 0, y: 0, z: 0 };
    } else if (this.aim) {
      const aimHorizontal = Math.hypot(this.aim.x, this.aim.z);
      const measuredHorizontal = Math.hypot(measured.x, measured.z);
      const aimSpeed = Math.hypot(this.aim.x, this.aim.y, this.aim.z);
      const measuredSpeed = Math.hypot(measured.x, measured.y, measured.z);
      if (aimHorizontal > 0.5 && measuredHorizontal < aimHorizontal * 0.45) {
        wallDamage = elytraKineticDamage(aimHorizontal, measuredHorizontal);
        this.model = { x: measured.x, y: measured.y, z: measured.z };
        this.bias = { x: 0, y: 0, z: 0 };
      } else if (measuredSpeed > aimSpeed * 1.6 + 0.4) {
        // external boost (hydrothermal vent, bouncy block...): continue from the real velocity
        this.model = { x: measured.x, y: measured.y, z: measured.z };
        this.bias = { x: 0, y: 0, z: 0 };
      } else {
        this.bias = {
          x: clampValue(this.bias.x + CORRECTION_GAIN * (this.aim.x - measured.x), CORRECTION_LIMIT),
          y: clampValue(this.bias.y + CORRECTION_GAIN * (this.aim.y - measured.y), CORRECTION_LIMIT),
          z: clampValue(this.bias.z + CORRECTION_GAIN * (this.aim.z - measured.z), CORRECTION_LIMIT)
        };
      }
    }

    const next = stepElytraGlide(this.model, look, { movementFactor, boosting });
    this.model = next;
    this.aim = next;
    const command = { x: next.x + this.bias.x, y: next.y + this.bias.y, z: next.z + this.bias.z };
    return {
      impulse: {
        x: clampValue(command.x - engineVelocity.x, IMPULSE_LIMIT),
        y: clampValue(command.y - engineVelocity.y, IMPULSE_LIMIT),
        z: clampValue(command.z - engineVelocity.z, IMPULSE_LIMIT)
      },
      wallDamage,
      model: next
    };
  }
}

/** Unit view direction from Bedrock yaw/pitch degrees (kept for tests and fallbacks). */
export function lookFromRotation(yawDegrees, pitchDegrees) {
  const yaw = (yawDegrees * Math.PI) / 180;
  const pitch = (pitchDegrees * Math.PI) / 180;
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch)
  };
}

/**
 * Pure edge-triggered glide start/stop controller (vanilla: double-tap jump in mid-air, ends on
 * landing or entering water).
 *
 * @param {{gliding:boolean, wasJumping:boolean, airTicks:number}} state previous state
 * @param {{onGround:boolean, inWater:boolean, flying:boolean, jumping:boolean}} input this tick
 */
export function updateGlideState(state, input) {
  const grounded = input.onGround || input.inWater || input.flying;
  const airTicks = grounded ? 0 : state.airTicks + 1;
  const jumpEdge = input.jumping && !state.wasJumping;
  let gliding = state.gliding && !grounded;
  let started = false;
  if (!gliding && !grounded && jumpEdge && airTicks >= 3) {
    gliding = true;
    started = true;
  }
  return {
    state: { gliding, wasJumping: input.jumping, airTicks },
    started,
    stopped: state.gliding && !gliding
  };
}
