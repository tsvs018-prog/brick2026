import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaddleBounce,
  checkCircleRectCollision,
  clampSpeed,
  calculateScore,
  isStageCompleted,
  generateStageBricks,
  BRICK_TYPES
} from './physics.js';

test('calculatePaddleBounce: center hit produces vertical bounce', () => {
  const result = calculatePaddleBounce(400, 350, 100, 300);
  assert.equal(result.offset, 0);
  assert.equal(result.angle, 0);
  assert.equal(Math.round(result.vx), 0);
  assert.equal(Math.round(result.vy), -300);
});

test('calculatePaddleBounce: right edge hit angles rightward with upward vy', () => {
  const result = calculatePaddleBounce(450, 350, 100, 300);
  assert.equal(result.offset, 1);
  assert.ok(result.vx > 0, 'vx should be positive for right-side bounce');
  assert.ok(result.vy < 0, 'vy should be negative (upwards)');
  const speed = Math.hypot(result.vx, result.vy);
  assert.ok(Math.abs(speed - 300) < 1, 'speed magnitude should match 300');
});

test('checkCircleRectCollision: detects head-on collision from above', () => {
  const circle = { x: 100, y: 92, radius: 8 };
  const rect = { x: 80, y: 95, width: 40, height: 20 };
  const col = checkCircleRectCollision(circle, rect);
  assert.equal(col.hit, true);
  assert.equal(col.normalY, -1);
});

test('checkCircleRectCollision: returns hit: false when separated', () => {
  const circle = { x: 20, y: 20, radius: 8 };
  const rect = { x: 80, y: 80, width: 40, height: 20 };
  const col = checkCircleRectCollision(circle, rect);
  assert.equal(col.hit, false);
});

test('clampSpeed: clamps speed and ensures vertical motion', () => {
  const fast = clampSpeed(500, 500, 200, 400);
  assert.ok(fast.speed <= 400.1, `Speed ${fast.speed} should not exceed max 400`);

  const slow = clampSpeed(50, 50, 200, 400);
  assert.ok(slow.speed >= 199.9, `Speed ${slow.speed} should be at least min 200`);

  const horizontal = clampSpeed(300, 0, 200, 400);
  assert.ok(Math.abs(horizontal.vy) >= 40, 'Should prevent zero vertical velocity');
});

test('calculateScore: applies combo and difficulty multipliers correctly', () => {
  const score1 = calculateScore(100, 1, 1);
  assert.equal(score1, 100);

  const scoreCombo = calculateScore(100, 3, 1); // 1 + 2 * 0.25 = 1.5x
  assert.equal(scoreCombo, 150);

  const scoreHardcore = calculateScore(100, 1, 1.5);
  assert.equal(scoreHardcore, 150);
});

test('isStageCompleted: checks stage completion state', () => {
  const activeBricks = [
    { type: BRICK_TYPES.NORMAL, hp: 1 },
    { type: BRICK_TYPES.MEDIUM, hp: 0 },
  ];
  assert.equal(isStageCompleted(activeBricks), false);

  const clearedBricks = [
    { type: BRICK_TYPES.NORMAL, hp: 0 },
    { type: BRICK_TYPES.MEDIUM, hp: 0 },
    { type: BRICK_TYPES.SOLID, hp: 99 },
  ];
  assert.equal(isStageCompleted(clearedBricks), true);
});

test('generateStageBricks: builds 5 unique stages with valid bricks', () => {
  for (let lvl = 1; lvl <= 5; lvl++) {
    const bricks = generateStageBricks(lvl, 800);
    assert.ok(bricks.length > 20, `Level ${lvl} should have more than 20 bricks`);
    for (const b of bricks) {
      assert.ok(b.width > 0);
      assert.ok(b.height > 0);
      assert.ok(b.hp > 0);
    }
  }
});
