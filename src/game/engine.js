import {
  BRICK_TYPES,
  POWER_UP_TYPES,
  calculatePaddleBounce,
  checkCircleRectCollision,
  clampSpeed,
  calculateScore,
  isStageCompleted,
  generateStageBricks,
} from './physics.js';
import { sound } from './audio.js';
import { ParticleSystem } from './particles.js';

export class BreakoutEngine {
  constructor(canvas, uiElements) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = uiElements;

    // Fixed virtual resolution
    this.width = 800;
    this.height = 600;

    this.particles = new ParticleSystem();

    // Game state
    this.state = 'title'; // 'title', 'playing', 'paused', 'stage_clear', 'gameover'
    this.stage = 1;
    this.maxStages = 5;
    this.score = 0;
    this.highScore = 0;
    this.lives = 3;
    this.maxLives = 5;
    this.combo = 0;
    this.comboTimer = 0;
    this.totalBricksDestroyed = 0;
    this.difficulty = 'normal'; // 'casual', 'normal', 'hardcore'
    this.difficultyMultiplier = 1;

    // Hitstop freeze effect
    this.hitstopTimer = 0;

    // Paddle properties
    this.paddle = {
      x: 345,
      y: 550,
      width: 110,
      normalWidth: 110,
      expandedWidth: 170,
      height: 16,
      vx: 0,
      speed: 680,
      expandTimer: 0,
      laserTimer: 0,
      laserCooldown: 0,
    };

    // Balls list (supports multi-ball)
    this.balls = [];
    this.ballStuckToPaddle = true;
    this.baseBallSpeed = 360;
    this.fireBallTimer = 0;

    // Entities
    this.bricks = [];
    this.powerUps = [];
    this.lasers = [];
    this.hasShield = false;

    // Input state
    this.keys = {
      left: false,
      right: false,
      space: false,
    };
    this.pointerX = this.width / 2;
    this.isPointerControlling = false;

    // Animation loop bookkeeping
    this.lastTime = 0;
    this.animationFrameId = null;

    // Load High Score
    try {
      this.highScore = parseInt(localStorage.getItem('neon_breakout_high_score') || '0', 10);
    } catch {}

    this.setupResizeHandler();
    this.initLevel(1);
    this.updateHUD();
    this.setGameState('title');
  }

  setupResizeHandler() {
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale((rect.width * dpr) / this.width, (rect.height * dpr) / this.height);
    };

    window.addEventListener('resize', resize);
    // Initial call
    setTimeout(resize, 0);
    this.resize = resize;
  }

  screenToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    return {
      x: (clientX - rect.x) * scaleX,
      y: (clientY - rect.y) * scaleY,
    };
  }

  setGameState(newState) {
    this.state = newState;
    document.body.dataset.state = newState;

    // Sync UI modal displays
    if (this.ui.titleScreen) this.ui.titleScreen.classList.toggle('hidden', newState !== 'title');
    if (this.ui.pauseScreen) this.ui.pauseScreen.classList.toggle('hidden', newState !== 'paused');
    if (this.ui.stageClearScreen) this.ui.stageClearScreen.classList.toggle('hidden', newState !== 'stage_clear');
    if (this.ui.gameOverScreen) this.ui.gameOverScreen.classList.toggle('hidden', newState !== 'gameover');

    if (newState === 'playing') {
      this.canvas.focus?.();
    }
  }

  setDifficulty(diff) {
    this.difficulty = diff;
    if (diff === 'casual') {
      this.difficultyMultiplier = 0.8;
      this.baseBallSpeed = 310;
      this.paddle.normalWidth = 130;
      this.paddle.expandedWidth = 190;
    } else if (diff === 'hardcore') {
      this.difficultyMultiplier = 1.5;
      this.baseBallSpeed = 410;
      this.paddle.normalWidth = 95;
      this.paddle.expandedWidth = 150;
    } else {
      this.difficultyMultiplier = 1.0;
      this.baseBallSpeed = 360;
      this.paddle.normalWidth = 110;
      this.paddle.expandedWidth = 170;
    }
    this.paddle.width = this.paddle.expandTimer > 0 ? this.paddle.expandedWidth : this.paddle.normalWidth;
  }

  startGame(diff = null) {
    if (diff) this.setDifficulty(diff);
    this.stage = 1;
    this.score = 0;
    this.lives = this.difficulty === 'casual' ? 4 : (this.difficulty === 'hardcore' ? 2 : 3);
    this.combo = 0;
    this.comboTimer = 0;
    this.totalBricksDestroyed = 0;
    this.initLevel(this.stage);
    this.setGameState('playing');
    this.updateHUD();
  }

  initLevel(stageIndex) {
    this.stage = stageIndex;
    this.bricks = generateStageBricks(stageIndex, this.width);
    this.powerUps = [];
    this.lasers = [];
    this.hasShield = false;
    this.particles.reset();

    // Reset paddle
    this.paddle.expandTimer = 0;
    this.paddle.laserTimer = 0;
    this.paddle.width = this.paddle.normalWidth;
    this.paddle.x = (this.width - this.paddle.width) / 2;

    // Reset ball(s)
    this.fireBallTimer = 0;
    this.resetBall();
    this.updateHUD();
  }

  resetBall() {
    this.balls = [
      {
        x: this.paddle.x + this.paddle.width / 2,
        y: this.paddle.y - 10,
        radius: 8,
        vx: 0,
        vy: 0,
        speed: this.baseBallSpeed,
        stuck: true,
      },
    ];
    this.ballStuckToPaddle = true;
  }

  launchBall() {
    if (!this.ballStuckToPaddle) return;
    this.ballStuckToPaddle = false;
    for (const ball of this.balls) {
      if (ball.stuck) {
        ball.stuck = false;
        // Launch upwards with slight angle based on offset
        const angle = (Math.random() - 0.5) * 0.4;
        ball.vx = ball.speed * Math.sin(angle);
        ball.vy = -ball.speed * Math.cos(angle);
      }
    }
    sound.playPaddleHit(0);
  }

  spawnPowerUp(x, y) {
    const roll = Math.random();
    let type = POWER_UP_TYPES.BONUS_SCORE;

    if (roll < 0.18) type = POWER_UP_TYPES.EXPAND_PADDLE;
    else if (roll < 0.34) type = POWER_UP_TYPES.MULTI_BALL;
    else if (roll < 0.48) type = POWER_UP_TYPES.LASER;
    else if (roll < 0.62) type = POWER_UP_TYPES.FIRE_BALL;
    else if (roll < 0.74) type = POWER_UP_TYPES.SHIELD;
    else if (roll < 0.86) type = POWER_UP_TYPES.SLOW_BALL;
    else if (roll < 0.94) type = POWER_UP_TYPES.EXTRA_LIFE;
    else type = POWER_UP_TYPES.BONUS_SCORE;

    this.powerUps.push({
      x,
      y,
      width: 28,
      height: 16,
      vy: 140,
      type,
    });
  }

  applyPowerUp(type) {
    sound.playPowerUp();
    this.particles.spawnBurst(this.paddle.x + this.paddle.width / 2, this.paddle.y, '#00ffff', 25, 200);

    switch (type) {
      case POWER_UP_TYPES.EXPAND_PADDLE:
        this.paddle.expandTimer = 12;
        this.paddle.width = this.paddle.expandedWidth;
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '板子擴展!', '#00ff88');
        break;

      case POWER_UP_TYPES.MULTI_BALL: {
        const newBalls = [];
        const base = this.balls[0] || { x: this.paddle.x + this.paddle.width / 2, y: this.paddle.y - 12, speed: this.baseBallSpeed };
        [-0.4, 0.4].forEach(angleOffset => {
          newBalls.push({
            x: base.x,
            y: base.y,
            radius: 8,
            vx: base.speed * Math.sin(angleOffset),
            vy: -Math.abs(base.speed * Math.cos(angleOffset)),
            speed: base.speed,
            stuck: false,
          });
        });
        this.balls.push(...newBalls);
        this.ballStuckToPaddle = false;
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '多球分裂!', '#00ffff');
        break;
      }

      case POWER_UP_TYPES.LASER:
        this.paddle.laserTimer = 10;
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '雙管雷射!', '#ff00ff');
        break;

      case POWER_UP_TYPES.FIRE_BALL:
        this.fireBallTimer = 8;
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '貫穿火球!', '#ff6600');
        break;

      case POWER_UP_TYPES.SHIELD:
        this.hasShield = true;
        this.particles.spawnFloatingText(this.width / 2, this.height - 30, '防護盾啟動!', '#ffea00');
        break;

      case POWER_UP_TYPES.SLOW_BALL:
        for (const b of this.balls) {
          b.speed = Math.max(220, b.speed * 0.7);
          const ratio = b.speed / Math.hypot(b.vx, b.vy);
          b.vx *= ratio;
          b.vy *= ratio;
        }
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '球速減緩', '#33ccff');
        break;

      case POWER_UP_TYPES.EXTRA_LIFE:
        if (this.lives < this.maxLives) {
          this.lives++;
          this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '生命 +1', '#ff3366');
        } else {
          this.score += 1000;
          this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '+1000 MAX', '#ffd700');
        }
        break;

      case POWER_UP_TYPES.BONUS_SCORE:
        this.score += 500;
        this.particles.spawnFloatingText(this.paddle.x + this.paddle.width / 2, this.paddle.y - 20, '+500 分', '#ffd700');
        break;
    }

    this.updateHUD();
  }

  fireLaser() {
    if (this.paddle.laserTimer <= 0 || this.paddle.laserCooldown > 0) return;
    this.paddle.laserCooldown = 0.22; // cooldown between shots

    const leftX = this.paddle.x + 8;
    const rightX = this.paddle.x + this.paddle.width - 8;
    const y = this.paddle.y - 4;

    this.lasers.push({ x: leftX, y, width: 4, height: 16, vy: -700 });
    this.lasers.push({ x: rightX, y, width: 4, height: 16, vy: -700 });

    sound.playLaser();
    this.particles.spawnBurst(leftX, y, '#ff00ff', 4, 80);
    this.particles.spawnBurst(rightX, y, '#ff00ff', 4, 80);
  }

  destroyBrick(brick, hitX, hitY) {
    brick.hp--;
    this.combo++;
    this.comboTimer = 2.0; // combo window
    this.totalBricksDestroyed++;

    const isDestroyed = brick.hp <= 0;
    sound.playBrickHit(this.combo, isDestroyed);

    const points = calculateScore(100 * (brick.maxHp || 1), this.combo, this.difficultyMultiplier);
    this.score += points;

    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        localStorage.setItem('neon_breakout_high_score', String(this.highScore));
      } catch {}
    }

    const brickCenterX = brick.x + brick.width / 2;
    const brickCenterY = brick.y + brick.height / 2;

    // Particles and float text
    const brickColor = this.getBrickColor(brick);
    this.particles.spawnBurst(hitX || brickCenterX, hitY || brickCenterY, brickColor, isDestroyed ? 20 : 8, 180);

    if (this.combo > 1) {
      this.particles.spawnFloatingText(brickCenterX, brickCenterY - 10, `+${points} (${this.combo}連擊)`, '#ffea00', 13);
    } else {
      this.particles.spawnFloatingText(brickCenterX, brickCenterY - 10, `+${points}`, '#ffffff', 12);
    }

    if (isDestroyed) {
      // Mystery brick always drops power-up
      if (brick.type === BRICK_TYPES.MYSTERY) {
        this.spawnPowerUp(brickCenterX, brickCenterY);
      } else if (Math.random() < 0.22) {
        // 22% random drop chance for other bricks
        this.spawnPowerUp(brickCenterX, brickCenterY);
      }

      // Bomb brick explosion
      if (brick.type === BRICK_TYPES.BOMB) {
        sound.playExplosion();
        this.particles.spawnExplosion(brickCenterX, brickCenterY, 70);
        this.explodeAdjacentBricks(brick);
      }
    }

    // Check level clear
    if (isStageCompleted(this.bricks)) {
      this.handleStageClear();
    }

    this.updateHUD();
  }

  explodeAdjacentBricks(bombBrick) {
    const bombCenterX = bombBrick.x + bombBrick.width / 2;
    const bombCenterY = bombBrick.y + bombBrick.height / 2;
    const radius = 80;

    for (const b of this.bricks) {
      if (b.hp <= 0 || b.id === bombBrick.id) continue;
      const bCenterX = b.x + b.width / 2;
      const bCenterY = b.y + b.height / 2;
      const dist = Math.hypot(bCenterX - bombCenterX, bCenterY - bombCenterY);

      if (dist <= radius) {
        // Destroy adjacent brick immediately
        b.hp = 0;
        this.score += 150 * this.difficultyMultiplier;
        this.particles.spawnBurst(bCenterX, bCenterY, '#ff5500', 16, 200);
        if (Math.random() < 0.35) {
          this.spawnPowerUp(bCenterX, bCenterY);
        }
      }
    }
  }

  handleStageClear() {
    sound.playStageClear();
    this.particles.spawnBurst(this.width / 2, this.height / 2, '#00ffff', 80, 300);
    this.particles.spawnBurst(this.width / 2, this.height / 2, '#ff00ff', 60, 260);

    setTimeout(() => {
      if (this.stage < this.maxStages) {
        if (this.ui.stageClearMsg) {
          this.ui.stageClearMsg.textContent = `第 ${this.stage} 關通關達成！`;
        }
        if (this.ui.stageClearStats) {
          this.ui.stageClearStats.textContent = `當前得分: ${this.score.toLocaleString()} | 連擊次數: ${this.combo}`;
        }
        this.setGameState('stage_clear');
      } else {
        // Game complete victory!
        this.handleVictory();
      }
    }, 600);
  }

  handleVictory() {
    this.setGameState('gameover');
    if (this.ui.gameOverTitle) this.ui.gameOverTitle.textContent = '🎉 全破達成！冠軍！';
    if (this.ui.gameOverStats) {
      this.ui.gameOverStats.innerHTML = `
        <div class="stat-row"><span>最終總分:</span><strong>${this.score.toLocaleString()}</strong></div>
        <div class="stat-row"><span>最高紀錄:</span><strong>${this.highScore.toLocaleString()}</strong></div>
        <div class="stat-row"><span>擊破磚塊:</span><strong>${this.totalBricksDestroyed}</strong></div>
        <div class="stat-row"><span>難度模式:</span><strong>${this.getDifficultyLabel()}</strong></div>
      `;
    }
  }

  handleLifeLost() {
    this.lives--;
    this.combo = 0;
    this.particles.addScreenShake(12);
    sound.playLifeLost();

    if (this.lives <= 0) {
      sound.playGameOver();
      setTimeout(() => {
        this.setGameState('gameover');
        if (this.ui.gameOverTitle) this.ui.gameOverTitle.textContent = 'GAME OVER';
        if (this.ui.gameOverStats) {
          this.ui.gameOverStats.innerHTML = `
            <div class="stat-row"><span>最終得分:</span><strong>${this.score.toLocaleString()}</strong></div>
            <div class="stat-row"><span>最高紀錄:</span><strong>${this.highScore.toLocaleString()}</strong></div>
            <div class="stat-row"><span>到達關卡:</span><strong>第 ${this.stage} / ${this.maxStages} 關</strong></div>
            <div class="stat-row"><span>擊破磚塊:</span><strong>${this.totalBricksDestroyed}</strong></div>
          `;
        }
      }, 500);
    } else {
      this.resetBall();
    }

    this.updateHUD();
  }

  nextStage() {
    if (this.stage < this.maxStages) {
      this.initLevel(this.stage + 1);
      this.setGameState('playing');
    } else {
      this.startGame();
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.setGameState('paused');
    } else if (this.state === 'paused') {
      this.setGameState('playing');
    }
  }

  updateHUD() {
    if (this.ui.scoreValue) this.ui.scoreValue.textContent = this.score.toLocaleString();
    if (this.ui.highScoreValue) this.ui.highScoreValue.textContent = this.highScore.toLocaleString();
    if (this.ui.stageValue) this.ui.stageValue.textContent = `${this.stage}/${this.maxStages}`;

    // Lives display (hearts)
    if (this.ui.livesContainer) {
      let heartsHtml = '';
      for (let i = 0; i < this.maxLives; i++) {
        if (i < this.lives) {
          heartsHtml += '<span class="heart active">❤️</span>';
        } else {
          heartsHtml += '<span class="heart inactive">🖤</span>';
        }
      }
      this.ui.livesContainer.innerHTML = heartsHtml;
    }

    // Active power-up indicators
    if (this.ui.powerUpDock) {
      const activePills = [];
      if (this.paddle.laserTimer > 0) {
        activePills.push(`<div class="dock-pill laser">⚡ 雷射 ${Math.ceil(this.paddle.laserTimer)}s</div>`);
      }
      if (this.paddle.expandTimer > 0) {
        activePills.push(`<div class="dock-pill expand">↔️ 寬板 ${Math.ceil(this.paddle.expandTimer)}s</div>`);
      }
      if (this.fireBallTimer > 0) {
        activePills.push(`<div class="dock-pill fire">🔥 火球 ${Math.ceil(this.fireBallTimer)}s</div>`);
      }
      if (this.hasShield) {
        activePills.push(`<div class="dock-pill shield">🛡️ 防護盾</div>`);
      }
      if (this.balls.length > 1) {
        activePills.push(`<div class="dock-pill multi">🏐 多球 x${this.balls.length}</div>`);
      }
      this.ui.powerUpDock.innerHTML = activePills.join('');
    }
  }

  getDifficultyLabel() {
    if (this.difficulty === 'casual') return '休閒';
    if (this.difficulty === 'hardcore') return '專家';
    return '一般';
  }

  getBrickColor(brick) {
    if (brick.type === BRICK_TYPES.BOMB) return '#ff2255';
    if (brick.type === BRICK_TYPES.MYSTERY) return '#ffd700';
    if (brick.type === BRICK_TYPES.ARMORED) {
      return brick.hp === 3 ? '#9d4edd' : (brick.hp === 2 ? '#c77dff' : '#e0aaff');
    }
    if (brick.type === BRICK_TYPES.MEDIUM) {
      return brick.hp === 2 ? '#ff00aa' : '#ff70d6';
    }
    // Normal bricks palette by row
    const rowColors = ['#ff0055', '#ff7700', '#ffea00', '#00ff66', '#00e5ff', '#7928ca'];
    return rowColors[brick.r % rowColors.length] || '#00e5ff';
  }

  // --- GAME UPDATE & PHYSICS LOOP ---
  update(rawDt) {
    // Clamped dt to prevent tunneling
    const dt = Math.min(rawDt, 0.05);

    // Hitstop logic
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.particles.update(dt);
      return;
    }

    if (this.state !== 'playing') {
      this.particles.update(dt);
      return;
    }

    // Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    // Power-up timers
    if (this.paddle.expandTimer > 0) {
      this.paddle.expandTimer -= dt;
      if (this.paddle.expandTimer <= 0) {
        this.paddle.width = this.paddle.normalWidth;
      }
    }
    if (this.paddle.laserTimer > 0) {
      this.paddle.laserTimer -= dt;
      if (this.paddle.laserCooldown > 0) {
        this.paddle.laserCooldown -= dt;
      }
    }
    if (this.fireBallTimer > 0) {
      this.fireBallTimer -= dt;
    }

    // Update Paddle Position
    let targetX = this.paddle.x;
    if (this.isPointerControlling) {
      targetX = this.pointerX - this.paddle.width / 2;
    } else {
      if (this.keys.left) targetX -= this.paddle.speed * dt;
      if (this.keys.right) targetX += this.paddle.speed * dt;
    }

    // Clamp paddle to screen boundaries
    this.paddle.x = Math.max(0, Math.min(this.width - this.paddle.width, targetX));

    // Update stuck balls (before launch)
    if (this.ballStuckToPaddle) {
      for (const b of this.balls) {
        if (b.stuck) {
          b.x = this.paddle.x + this.paddle.width / 2;
          b.y = this.paddle.y - b.radius - 1;
        }
      }
    }

    // Update Lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y += laser.vy * dt;

      // Check collision with bricks
      let laserHit = false;
      for (const brick of this.bricks) {
        if (brick.hp <= 0) continue;
        if (
          laser.x >= brick.x &&
          laser.x <= brick.x + brick.width &&
          laser.y >= brick.y &&
          laser.y <= brick.y + brick.height
        ) {
          this.destroyBrick(brick, laser.x, laser.y);
          laserHit = true;
          break;
        }
      }

      if (laserHit || laser.y < -20) {
        this.lasers.splice(i, 1);
      }
    }

    // Update Falling Power-Ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pup = this.powerUps[i];
      pup.y += pup.vy * dt;

      // Check collision with paddle
      if (
        pup.y + pup.height >= this.paddle.y &&
        pup.y <= this.paddle.y + this.paddle.height &&
        pup.x + pup.width >= this.paddle.x &&
        pup.x <= this.paddle.x + this.paddle.width
      ) {
        this.applyPowerUp(pup.type);
        this.powerUps.splice(i, 1);
        continue;
      }

      // Despawn if fallen below screen
      if (pup.y > this.height + 20) {
        this.powerUps.splice(i, 1);
      }
    }

    // Update Balls Physics & Collisions
    const isFireBall = this.fireBallTimer > 0;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      if (ball.stuck) continue;

      // Particle trail
      this.particles.spawnBallTrail(ball.x, ball.y, isFireBall ? '#ff4400' : '#00f3ff');

      // Move ball
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Wall collisions (Left & Right)
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        sound.playWallHit();
        this.particles.spawnBurst(ball.x, ball.y, '#00ffff', 4, 100);
      } else if (ball.x + ball.radius >= this.width) {
        ball.x = this.width - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        sound.playWallHit();
        this.particles.spawnBurst(ball.x, ball.y, '#00ffff', 4, 100);
      }

      // Ceiling collision
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        sound.playWallHit();
        this.particles.spawnBurst(ball.x, ball.y, '#00ffff', 4, 100);
      }

      // Floor Shield collision
      if (this.hasShield && ball.y + ball.radius >= this.height - 10) {
        this.hasShield = false;
        ball.vy = -Math.abs(ball.vy);
        ball.y = this.height - 12 - ball.radius;
        sound.playWallHit();
        this.particles.spawnBurst(ball.x, this.height - 8, '#ffea00', 30, 240);
        this.particles.addScreenShake(6);
        this.updateHUD();
      }

      // Floor (Out of bounds)
      if (ball.y - ball.radius > this.height) {
        this.balls.splice(i, 1);
        continue;
      }

      // Paddle collision
      if (ball.vy > 0) {
        const paddleCol = checkCircleRectCollision(ball, this.paddle);
        if (paddleCol.hit) {
          const bounce = calculatePaddleBounce(ball.x, this.paddle.x, this.paddle.width, ball.speed);
          ball.vx = bounce.vx;
          ball.vy = bounce.vy;
          ball.y = this.paddle.y - ball.radius;

          sound.playPaddleHit(bounce.offset);
          this.particles.spawnBurst(ball.x, ball.y, '#00f3ff', 8, 120);

          // Reset combo when hitting paddle
          this.combo = 0;
        }
      }

      // Brick collisions
      for (const brick of this.bricks) {
        if (brick.hp <= 0) continue;

        const col = checkCircleRectCollision(ball, brick);
        if (col.hit) {
          this.destroyBrick(brick, ball.x, ball.y);

          // Fireball pierces through without deflecting!
          if (!isFireBall) {
            if (col.normalX !== 0) {
              ball.vx = col.normalX * Math.abs(ball.vx);
            }
            if (col.normalY !== 0) {
              ball.vy = col.normalY * Math.abs(ball.vy);
            }
          }

          // Slight speed escalation per hit
          ball.speed = Math.min(ball.speed + 3, 560);
          const clamped = clampSpeed(ball.vx, ball.vy, this.baseBallSpeed, 560);
          ball.vx = clamped.vx;
          ball.vy = clamped.vy;

          break; // Process one brick collision per frame per ball
        }
      }
    }

    // Check if all balls were lost
    if (this.balls.length === 0 && !this.ballStuckToPaddle) {
      this.handleLifeLost();
    }

    // Update Particles
    this.particles.update(dt);
  }

  // --- RENDERING LOOP ---
  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Apply screen shake
    const shake = this.particles.getShakeOffset();
    this.ctx.save();
    this.ctx.translate(shake.x, shake.y);

    // Background Cyber Grid
    this.renderBackgroundGrid();

    // Render Bottom Shield if active
    if (this.hasShield) {
      this.renderShield();
    }

    // Render Bricks
    for (const brick of this.bricks) {
      if (brick.hp > 0) {
        this.renderBrick(brick);
      }
    }

    // Render Falling Power-Ups
    for (const pup of this.powerUps) {
      this.renderPowerUp(pup);
    }

    // Render Lasers
    for (const laser of this.lasers) {
      this.renderLaser(laser);
    }

    // Render Paddle
    this.renderPaddle();

    // Render Balls
    for (const ball of this.balls) {
      this.renderBall(ball);
    }

    // Render Particles & Popups
    this.particles.render(this.ctx);

    this.ctx.restore();
  }

  renderBackgroundGrid() {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
    this.ctx.lineWidth = 1;
    const gridSize = 40;

    for (let x = 0; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Danger zone at the bottom
    const dangerGrad = this.ctx.createLinearGradient(0, this.height - 40, 0, this.height);
    dangerGrad.addColorStop(0, 'rgba(255, 0, 85, 0)');
    dangerGrad.addColorStop(1, 'rgba(255, 0, 85, 0.12)');
    this.ctx.fillStyle = dangerGrad;
    this.ctx.fillRect(0, this.height - 40, this.width, 40);

    this.ctx.restore();
  }

  renderShield() {
    this.ctx.save();
    this.ctx.strokeStyle = '#ffea00';
    this.ctx.lineWidth = 4;
    this.ctx.shadowColor = '#ffea00';
    this.ctx.shadowBlur = 12;

    this.ctx.beginPath();
    this.ctx.moveTo(0, this.height - 6);
    this.ctx.lineTo(this.width, this.height - 6);
    this.ctx.stroke();

    this.ctx.restore();
  }

  renderBrick(brick) {
    const { x, y, width, height, hp, maxHp, type } = brick;
    const baseColor = this.getBrickColor(brick);

    this.ctx.save();

    // Outer glow
    this.ctx.shadowColor = baseColor;
    this.ctx.shadowBlur = 8;

    // Body gradient
    const grad = this.ctx.createLinearGradient(x, y, x, y + height);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, baseColor);
    grad.addColorStop(1, '#050711');
    this.ctx.fillStyle = grad;

    // Rounded brick rect
    const r = 4;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, r);
    this.ctx.fill();

    // Crisp neon outline
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = baseColor;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Special Brick Icons
    if (type === BRICK_TYPES.BOMB) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('💣', x + width / 2, y + height / 2);
    } else if (type === BRICK_TYPES.MYSTERY) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 13px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('?', x + width / 2, y + height / 2);
    } else if (maxHp > 1) {
      // Crack or durability pips
      if (hp < maxHp) {
        // Draw damage crack
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width * 0.3, y + 2);
        this.ctx.lineTo(x + width * 0.5, y + height * 0.6);
        this.ctx.lineTo(x + width * 0.7, y + height - 2);
        this.ctx.stroke();
      } else {
        // Durability pips
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (let p = 0; p < hp; p++) {
          this.ctx.beginPath();
          this.ctx.arc(x + width / 2 + (p - (hp - 1) / 2) * 8, y + height / 2, 2.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }

    this.ctx.restore();
  }

  renderPaddle() {
    const { x, y, width, height, laserTimer, expandTimer } = this.paddle;

    this.ctx.save();

    // Glowing paddle body
    const primaryColor = laserTimer > 0 ? '#ff00ff' : (expandTimer > 0 ? '#00ff88' : '#00f3ff');
    this.ctx.shadowColor = primaryColor;
    this.ctx.shadowBlur = 14;

    const grad = this.ctx.createLinearGradient(x, y, x, y + height);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, primaryColor);
    grad.addColorStop(1, '#001a33');
    this.ctx.fillStyle = grad;

    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, 8);
    this.ctx.fill();

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Center jewel indicator
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(x + width / 2, y + height / 2, 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Laser cannons on edges if laser powerup is active
    if (laserTimer > 0) {
      this.ctx.fillStyle = '#ff00ff';
      this.ctx.fillRect(x + 4, y - 6, 6, 6);
      this.ctx.fillRect(x + width - 10, y - 6, 6, 6);
    }

    this.ctx.restore();
  }

  renderBall(ball) {
    const isFire = this.fireBallTimer > 0;
    const color = isFire ? '#ff4400' : '#00f3ff';

    this.ctx.save();
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 12;

    const grad = this.ctx.createRadialGradient(
      ball.x - 2,
      ball.y - 2,
      1,
      ball.x,
      ball.y,
      ball.radius
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, color);
    grad.addColorStop(1, isFire ? '#660000' : '#003366');

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  renderPowerUp(pup) {
    const { x, y, width, height, type } = pup;
    let label = '⚡';
    let color = '#00ffff';

    switch (type) {
      case POWER_UP_TYPES.EXPAND_PADDLE:
        label = '↔️';
        color = '#00ff88';
        break;
      case POWER_UP_TYPES.MULTI_BALL:
        label = '🏐';
        color = '#00e5ff';
        break;
      case POWER_UP_TYPES.LASER:
        label = '🔫';
        color = '#ff00ff';
        break;
      case POWER_UP_TYPES.FIRE_BALL:
        label = '🔥';
        color = '#ff6600';
        break;
      case POWER_UP_TYPES.SHIELD:
        label = '🛡️';
        color = '#ffea00';
        break;
      case POWER_UP_TYPES.SLOW_BALL:
        label = '⏳';
        color = '#33ccff';
        break;
      case POWER_UP_TYPES.EXTRA_LIFE:
        label = '❤️';
        color = '#ff3366';
        break;
      case POWER_UP_TYPES.BONUS_SCORE:
        label = '💎';
        color = '#ffd700';
        break;
    }

    this.ctx.save();
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 10;

    // Pill container
    this.ctx.fillStyle = '#0f172a';
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, width, height, 8);
    this.ctx.fill();
    this.ctx.stroke();

    // Text icon
    this.ctx.shadowBlur = 0;
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, x + width / 2, y + height / 2 + 1);

    this.ctx.restore();
  }

  renderLaser(laser) {
    this.ctx.save();
    this.ctx.shadowColor = '#ff00ff';
    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(laser.x - laser.width / 2, laser.y, laser.width, laser.height);
    this.ctx.restore();
  }

  // --- MAIN LOOP ---
  startLoop() {
    const loop = (timestamp) => {
      if (!this.lastTime) this.lastTime = timestamp;
      const dt = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;

      this.update(dt);
      this.render();

      this.animationFrameId = requestAnimationFrame(loop);
    };

    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.resize);
  }
}
