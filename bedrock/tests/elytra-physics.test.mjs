import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ELYTRA_MOVEMENT_FACTORS,
  ElytraGlideController,
  elytraKineticDamage,
  fireworkBoostTicks,
  lookFromRotation,
  stepElytraGlide,
  updateGlideState
} from '../runtime/equipment/elytra-physics.js';

const horizontal = v => Math.hypot(v.x, v.z);

function fly({ pitch, ticks, start = { x: 0, y: 0, z: 0.5 }, factor = 0.99, boostTicks = 0 }) {
  const look = lookFromRotation(0, pitch);
  let v = start;
  let y = 0;
  for (let i = 0; i < ticks; i += 1) {
    v = stepElytraGlide(v, look, { movementFactor: factor, boosting: i < boostTicks });
    y += v.y;
  }
  return { v, y };
}

test('elytra physics: Java movement factors are Armored 0.97 and Crystalite 1.0', () => {
  assert.equal(ELYTRA_MOVEMENT_FACTORS.elytra_armored, 0.97);
  assert.equal(ELYTRA_MOVEMENT_FACTORS.elytra_crystalite, 1.0);
});

test('elytra physics: diving gains speed, pulling up trades speed for height (vanilla behaviour)', () => {
  const dive = fly({ pitch: 45, ticks: 60 });
  assert.ok(horizontal(dive.v) > 0.5, 'dive keeps/gains horizontal speed');
  assert.ok(dive.y < -20, 'diving loses altitude');
  const diveSpeed = Math.hypot(dive.v.x, dive.v.y, dive.v.z);
  assert.ok(diveSpeed > 1.0, `dive reaches high speed: ${diveSpeed.toFixed(2)}`);

  // Pull up from a fast dive: speed converts into altitude gain.
  const fast = { x: 0, y: -1.0, z: 1.2 };
  const climb = fly({ pitch: -35, ticks: 25, start: fast });
  assert.ok(climb.v.y > 0, `pull-up ends climbing: vy=${climb.v.y.toFixed(3)}`);
  assert.ok(climb.y > -3, `pull-up recovers altitude quickly: ${climb.y.toFixed(2)}`);
  assert.ok(horizontal(climb.v) < 1.2, 'climbing sheds horizontal speed');
});

test('elytra physics: level flight glides slowly downward and never falls like a stone', () => {
  const level = fly({ pitch: 0, ticks: 100 });
  assert.ok(level.y < 0 && level.y > -80, `level glide altitude change ${level.y.toFixed(1)}`);
  assert.ok(level.v.y > -0.5, 'terminal descent is gentle');
});

test('elytra physics: Crystalite (1.0) keeps speed longer than Armored (0.97)', () => {
  const crystalite = fly({ pitch: 0, ticks: 80, factor: ELYTRA_MOVEMENT_FACTORS.elytra_crystalite, start: { x: 0, y: 0, z: 1.0 } });
  const armored = fly({ pitch: 0, ticks: 80, factor: ELYTRA_MOVEMENT_FACTORS.elytra_armored, start: { x: 0, y: 0, z: 1.0 } });
  assert.ok(horizontal(crystalite.v) > horizontal(armored.v) * 1.5);
});

test('elytra physics: firework boost accelerates towards 1.5x the look vector', () => {
  const boosted = fly({ pitch: 5, ticks: 20, boostTicks: 20 });
  const speed = Math.hypot(boosted.v.x, boosted.v.y, boosted.v.z);
  assert.ok(speed > 1.2 && speed < 1.7, `boost speed ${speed.toFixed(2)}`);
  for (let i = 0; i < 200; i += 1) {
    assert.ok(fireworkBoostTicks(1, () => i / 200) >= 10);
  }
  assert.ok(fireworkBoostTicks(3, () => 0.99) <= 10 * 3 + 5 + 6);
});

test('elytra physics: fly-into-wall damage matches Java (speed loss * 10 - 3)', () => {
  assert.equal(elytraKineticDamage(1.0, 0.9), 0);
  assert.ok(Math.abs(elytraKineticDamage(1.5, 0.2) - 10) < 1e-9);
});

test('glide controller: needs a fresh mid-air jump press, stops on landing/water, ignores takeoff jump', () => {
  let state = { gliding: false, wasJumping: false, airTicks: 0 };
  const tick = input => {
    const result = updateGlideState(state, { onGround: false, inWater: false, flying: false, jumping: false, ...input });
    state = result.state;
    return result;
  };
  // Takeoff: jump held on the ground then rising.
  state = updateGlideState(state, { onGround: true, inWater: false, flying: false, jumping: true }).state;
  assert.equal(tick({ jumping: true }).started, false, 'holding the takeoff jump does not glide');
  assert.equal(tick({ jumping: true }).started, false);
  tick({ jumping: false });
  tick({ jumping: false });
  assert.equal(tick({ jumping: false }).state.gliding, false, 'falling without pressing jump never glides');
  assert.equal(tick({ jumping: true }).started, true, 'fresh press in mid-air starts the glide');
  assert.equal(tick({ jumping: true }).state.gliding, true);
  assert.equal(tick({ inWater: true }).stopped, true, 'water ends the glide');
  assert.equal(state.gliding, false);
});

/**
 * Simulates a Bedrock-like player engine under script control: the script may only add an impulse to
 * the current velocity; the engine then applies air friction + gravity either before ("damp-then-move")
 * or after ("move-then-damp") moving. `latency` delays the displacement the script observes.
 */
function simulateEngine({ order, latency = 0, pitch = 8, ticks = 90, factor = 1.0, boostTicks = 0 }) {
  const look = lookFromRotation(0, pitch);
  const controller = new ElytraGlideController();
  const friction = 0.91;
  const gravity = 0.08;
  let pos = { x: 0, y: 100, z: 0 };
  let motion = { x: 0, y: -0.2, z: 0.7 };
  const delivered = [];
  const modelTrail = [];
  for (let t = 0; t < ticks; t += 1) {
    const stale = delivered[Math.max(0, delivered.length - 1 - latency)] ?? { ...motion };
    const measured = delivered.length === 0 ? { ...motion } : stale;
    const result = controller.step({
      measured,
      engineVelocity: motion,
      look,
      movementFactor: factor,
      boosting: t < boostTicks,
      started: t === 0
    });
    motion = { x: motion.x + result.impulse.x, y: motion.y + result.impulse.y, z: motion.z + result.impulse.z };
    let step;
    if (order === 'move-then-damp') {
      step = { ...motion };
      pos = { x: pos.x + step.x, y: pos.y + step.y, z: pos.z + step.z };
      motion = { x: motion.x * friction, y: (motion.y - gravity) * 0.98, z: motion.z * friction };
    } else {
      motion = { x: motion.x * friction, y: (motion.y - gravity) * 0.98, z: motion.z * friction };
      step = { ...motion };
      pos = { x: pos.x + step.x, y: pos.y + step.y, z: pos.z + step.z };
    }
    delivered.push(step);
    modelTrail.push(result.model);
  }
  // pure Java trajectory for comparison
  let v = { x: 0, y: -0.2, z: 0.7 };
  const java = [];
  for (let t = 0; t < ticks; t += 1) {
    v = stepElytraGlide(v, look, { movementFactor: factor, boosting: t < boostTicks });
    java.push(v);
  }
  return { delivered, java, pos };
}

test('glide controller: delivered motion tracks the Java elytra model for any engine damping order', () => {
  for (const order of ['move-then-damp', 'damp-then-move']) {
    for (const latency of [0, 1]) {
      const { delivered, java } = simulateEngine({ order, latency });
      const window = delivered.slice(40);
      const reference = java.slice(40);
      let horizontalError = 0;
      let verticalError = 0;
      let horizontalSpeed = 0;
      for (let i = 0; i < window.length; i += 1) {
        horizontalError += Math.abs(Math.hypot(window[i].x, window[i].z) - Math.hypot(reference[i].x, reference[i].z));
        verticalError += Math.abs(window[i].y - reference[i].y);
        horizontalSpeed += Math.hypot(reference[i].x, reference[i].z);
      }
      horizontalError /= window.length;
      verticalError /= window.length;
      horizontalSpeed /= window.length;
      assert.ok(horizontalError / horizontalSpeed < 0.12, `${order}/latency ${latency}: horizontal error ${(horizontalError / horizontalSpeed).toFixed(3)}`);
      assert.ok(verticalError < 0.08, `${order}/latency ${latency}: vertical error ${verticalError.toFixed(3)}`);
    }
  }
});

test('glide controller: a wall hit resets the model and reports Java kinetic damage; vents are adopted', () => {
  const controller = new ElytraGlideController();
  const look = lookFromRotation(0, 0);
  controller.step({ measured: { x: 0, y: 0, z: 1.4 }, engineVelocity: { x: 0, y: 0, z: 1.4 }, look, movementFactor: 1, boosting: false, started: true });
  const crash = controller.step({
    measured: { x: 0, y: 0, z: 0.05 },
    engineVelocity: { x: 0, y: 0, z: 0.05 },
    look,
    movementFactor: 1,
    boosting: false,
    started: false
  });
  assert.ok(crash.wallDamage > 8, `wall damage ${crash.wallDamage.toFixed(1)}`);
  assert.ok(Math.hypot(crash.model.x, crash.model.z) < 0.2, 'model restarts from the crash speed');
  const vent = new ElytraGlideController();
  vent.step({ measured: { x: 0, y: 0, z: 0.6 }, engineVelocity: { x: 0, y: 0, z: 0.6 }, look, movementFactor: 1, boosting: false, started: true });
  const boosted = vent.step({ measured: { x: 0, y: 1.5, z: 0.6 }, engineVelocity: { x: 0, y: 1.5, z: 0.6 }, look, movementFactor: 1, boosting: false, started: false });
  assert.ok(boosted.model.y > 1.0, 'an external updraft becomes the new vertical velocity');
});
