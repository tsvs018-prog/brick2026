/**
 * Pure physics, collision mathematics, and game rules for Neon Breakout.
 * Fully decoupled from DOM / Canvas rendering for testability and zero-garbage execution.
 */

export const BRICK_TYPES = {
  NORMAL: 1,      // 1 hit to break
  MEDIUM: 2,      // 2 hits to break
  ARMORED: 3,     // 3 hits to break
  BOMB: 4,        // Explodes 3x3 surrounding bricks
  MYSTERY: 5,     // Guaranteed power-up drop
  SOLID: 9,       // Indestructible (if used)
};

export const POWER_UP_TYPES = {
  MULTI_BALL: 'multi_ball',     // Splits into 3 balls
  EXPAND_PADDLE: 'expand',      // Paddle grows wider for 12s
  LASER: 'laser',               // Paddle shoots laser beams
  SLOW_BALL: 'slow',            // Slows ball down for precision
  FIRE_BALL: 'fire_ball',       // Pierces through bricks
  SHIELD: 'shield',             // Floor barrier catches ball once
  EXTRA_LIFE: 'life',           // +1 Life
  BONUS_SCORE: 'score',         // +500 points
};

/**
 * Calculates ball bounce velocity vector off the paddle.
 * Hit offset relative to paddle center (-1 = far left, 0 = center, +1 = far right).
 * Angle is mapped up to maxAngleRad (defaults to 75 deg / ~1.3 rad).
 */
export function calculatePaddleBounce(ballX, paddleX, paddleWidth, currentSpeed, maxAngleRad = (Math.PI * 5) / 12) {
  const halfWidth = Math.max(paddleWidth / 2, 1);
  const paddleCenter = paddleX + halfWidth;
  const rawOffset = (ballX - paddleCenter) / halfWidth;
  const clampedOffset = Math.max(-1, Math.min(1, rawOffset));

  const angle = clampedOffset * maxAngleRad;
  let vx = currentSpeed * Math.sin(angle);
  let vy = -currentSpeed * Math.cos(angle);

  // Guard against near-horizontal bounces
  const minVerticalRatio = 0.25;
  const minVy = currentSpeed * minVerticalRatio;
  if (Math.abs(vy) < minVy) {
    vy = -minVy;
    vx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, currentSpeed * currentSpeed - vy * vy));
  }

  return {
    vx,
    vy,
    angle,
    offset: clampedOffset,
  };
}

/**
 * Circle vs Axis-Aligned Bounding Box (AABB) collision detection.
 * Returns hit result and collision surface normal.
 */
export function checkCircleRectCollision(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;
  const distanceSq = distanceX * distanceX + distanceY * distanceY;

  if (distanceSq > circle.radius * circle.radius) {
    return { hit: false, normalX: 0, normalY: 0 };
  }

  // Inside or touching the rectangle: determine primary collision face
  const overlapLeft = circle.x + circle.radius - rect.x;
  const overlapRight = rect.x + rect.width - (circle.x - circle.radius);
  const overlapTop = circle.y + circle.radius - rect.y;
  const overlapBottom = rect.y + rect.height - (circle.y - circle.radius);

  const minOverlapX = Math.min(overlapLeft, overlapRight);
  const minOverlapY = Math.min(overlapTop, overlapBottom);

  let normalX = 0;
  let normalY = 0;

  if (minOverlapX < minOverlapY) {
    normalX = overlapLeft < overlapRight ? -1 : 1;
  } else {
    normalY = overlapTop < overlapBottom ? -1 : 1;
  }

  return {
    hit: true,
    normalX,
    normalY,
    distanceSq,
  };
}

/**
 * Clamps a 2D velocity vector to maintain magnitude between minSpeed and maxSpeed,
 * and ensures the vertical velocity never drops to zero.
 */
export function clampSpeed(vx, vy, minSpeed, maxSpeed) {
  const currentSpeed = Math.hypot(vx, vy);
  if (currentSpeed === 0) {
    return { vx: 0, vy: -minSpeed };
  }

  let targetSpeed = currentSpeed;
  if (currentSpeed < minSpeed) targetSpeed = minSpeed;
  if (currentSpeed > maxSpeed) targetSpeed = maxSpeed;

  const ratio = targetSpeed / currentSpeed;
  let newVx = vx * ratio;
  let newVy = vy * ratio;

  // Prevent horizontal lock-up
  const minVy = targetSpeed * 0.2;
  if (Math.abs(newVy) < minVy) {
    newVy = (newVy < 0 ? -1 : 1) * minVy;
    newVx = Math.sign(newVx || 1) * Math.sqrt(Math.max(0, targetSpeed * targetSpeed - newVy * newVy));
  }

  return { vx: newVx, vy: newVy, speed: targetSpeed };
}

/**
 * Calculates score with combo multiplier and difficulty scaling.
 */
export function calculateScore(basePoints, combo = 1, difficultyMultiplier = 1) {
  const clampedCombo = Math.max(1, combo);
  const comboMultiplier = Math.min(4.0, 1 + (clampedCombo - 1) * 0.25);
  return Math.round(basePoints * comboMultiplier * difficultyMultiplier);
}

/**
 * Determines whether the current stage is cleared.
 * Returns true if all breakable bricks (hp > 0 and type != SOLID) are destroyed.
 */
export function isStageCompleted(bricks) {
  if (!bricks || bricks.length === 0) return true;
  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    if (b.type !== BRICK_TYPES.SOLID && b.hp > 0) {
      return false;
    }
  }
  return true;
}

/**
 * Generates brick grid data for a specified stage index (1-based).
 * Playfield dimensions: standard width = 800, height = 600.
 */
export function generateStageBricks(stageIndex, canvasWidth = 800) {
  const bricks = [];
  const padding = 8;
  const marginTop = 70;

  // 5 distinct level layouts
  switch (stageIndex) {
    case 1: {
      // Classic 5-row wall
      const cols = 10;
      const rows = 5;
      const brickWidth = (canvasWidth - (cols + 1) * padding) / cols;
      const brickHeight = 22;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const type = (r === 0 && (c === 2 || c === 7)) ? BRICK_TYPES.MYSTERY :
                       (r === 1 && (c === 4 || c === 5)) ? BRICK_TYPES.BOMB :
                       (r <= 1) ? BRICK_TYPES.MEDIUM : BRICK_TYPES.NORMAL;
          const hp = type === BRICK_TYPES.MEDIUM ? 2 : 1;
          bricks.push({
            id: `b_1_${r}_${c}`,
            r,
            c,
            x: padding + c * (brickWidth + padding),
            y: marginTop + r * (brickHeight + padding),
            width: brickWidth,
            height: brickHeight,
            type,
            hp,
            maxHp: hp,
          });
        }
      }
      break;
    }

    case 2: {
      // Pyramid / Diamond fortress
      const cols = 11;
      const rows = 7;
      const brickWidth = (canvasWidth - (cols + 1) * padding) / cols;
      const brickHeight = 20;

      for (let r = 0; r < rows; r++) {
        const span = Math.min(r + 2, rows - r + 2);
        const centerCol = Math.floor(cols / 2);
        for (let c = 0; c < cols; c++) {
          const dist = Math.abs(c - centerCol);
          if (dist <= span) {
            let type = BRICK_TYPES.NORMAL;
            if (dist === 0 && r === 3) type = BRICK_TYPES.BOMB;
            else if (dist === span) type = BRICK_TYPES.MEDIUM;
            else if (r === 0 || r === rows - 1) type = BRICK_TYPES.MYSTERY;

            const hp = type === BRICK_TYPES.ARMORED ? 3 : (type === BRICK_TYPES.MEDIUM ? 2 : 1);
            bricks.push({
              id: `b_2_${r}_${c}`,
              r,
              c,
              x: padding + c * (brickWidth + padding),
              y: marginTop + r * (brickHeight + padding),
              width: brickWidth,
              height: brickHeight,
              type,
              hp,
              maxHp: hp,
            });
          }
        }
      }
      break;
    }

    case 3: {
      // Space Invader formation
      const cols = 12;
      const rows = 8;
      const brickWidth = (canvasWidth - (cols + 1) * padding) / cols;
      const brickHeight = 20;

      // Invader pixel map (8x12)
      const map = [
        [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 5, 1, 1, 1, 1, 5, 1, 1, 0],
        [1, 1, 1, 1, 1, 4, 4, 1, 1, 1, 1, 1],
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
        [0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0],
      ];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const val = map[r][c];
          if (val > 0) {
            let type = val === 5 ? BRICK_TYPES.MYSTERY :
                       val === 4 ? BRICK_TYPES.BOMB :
                       (r === 4 ? BRICK_TYPES.ARMORED : (r <= 2 ? BRICK_TYPES.MEDIUM : BRICK_TYPES.NORMAL));
            const hp = type === BRICK_TYPES.ARMORED ? 3 : (type === BRICK_TYPES.MEDIUM ? 2 : 1);
            bricks.push({
              id: `b_3_${r}_${c}`,
              r,
              c,
              x: padding + c * (brickWidth + padding),
              y: marginTop + r * (brickHeight + padding),
              width: brickWidth,
              height: brickHeight,
              type,
              hp,
              maxHp: hp,
            });
          }
        }
      }
      break;
    }

    case 4: {
      // Twin Neon Castles with Bomb Center
      const cols = 12;
      const rows = 8;
      const brickWidth = (canvasWidth - (cols + 1) * padding) / cols;
      const brickHeight = 20;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Center corridor is clear except for bomb clusters
          if ((c === 5 || c === 6) && (r !== 2 && r !== 5)) {
            continue;
          }

          let type = BRICK_TYPES.NORMAL;
          if ((c === 5 || c === 6) && (r === 2 || r === 5)) {
            type = BRICK_TYPES.BOMB;
          } else if (c === 0 || c === cols - 1 || r === 0) {
            type = BRICK_TYPES.ARMORED;
          } else if (c === 3 || c === 8) {
            type = BRICK_TYPES.MYSTERY;
          } else if (r % 2 === 1) {
            type = BRICK_TYPES.MEDIUM;
          }

          const hp = type === BRICK_TYPES.ARMORED ? 3 : (type === BRICK_TYPES.MEDIUM ? 2 : 1);
          bricks.push({
            id: `b_4_${r}_${c}`,
            r,
            c,
            x: padding + c * (brickWidth + padding),
            y: marginTop + r * (brickHeight + padding),
            width: brickWidth,
            height: brickHeight,
            type,
            hp,
            maxHp: hp,
          });
        }
      }
      break;
    }

    case 5:
    default: {
      // The Grand Citadel (Boss Wall)
      const cols = 14;
      const rows = 9;
      const brickWidth = (canvasWidth - (cols + 1) * padding) / cols;
      const brickHeight = 18;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let type = BRICK_TYPES.NORMAL;
          if (r === 0 || r === 1) {
            type = (c % 2 === 0) ? BRICK_TYPES.ARMORED : BRICK_TYPES.MEDIUM;
          } else if ((r === 4 && (c === 3 || c === 10)) || (r === 2 && c === 6)) {
            type = BRICK_TYPES.BOMB;
          } else if (r === 3 && (c === 2 || c === 11)) {
            type = BRICK_TYPES.MYSTERY;
          } else if (r % 2 === 0) {
            type = BRICK_TYPES.MEDIUM;
          }

          const hp = type === BRICK_TYPES.ARMORED ? 3 : (type === BRICK_TYPES.MEDIUM ? 2 : 1);
          bricks.push({
            id: `b_5_${r}_${c}`,
            r,
            c,
            x: padding + c * (brickWidth + padding),
            y: marginTop + r * (brickHeight + padding),
            width: brickWidth,
            height: brickHeight,
            type,
            hp,
            maxHp: hp,
          });
        }
      }
      break;
    }
  }

  return bricks;
}
