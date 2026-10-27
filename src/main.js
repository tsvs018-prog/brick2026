import { BreakoutEngine } from './game/engine.js';
import { sound } from './game/audio.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');

  // UI Element bindings
  const uiElements = {
    scoreValue: document.getElementById('score-val'),
    highScoreValue: document.getElementById('highscore-val'),
    stageValue: document.getElementById('stage-val'),
    livesContainer: document.getElementById('lives-container'),
    powerUpDock: document.getElementById('powerup-dock'),
    titleScreen: document.getElementById('title-screen'),
    pauseScreen: document.getElementById('pause-screen'),
    stageClearScreen: document.getElementById('stage-clear-screen'),
    stageClearTitle: document.getElementById('stage-clear-title'),
    stageClearMsg: document.getElementById('stage-clear-msg'),
    stageClearStats: document.getElementById('stage-clear-stats'),
    gameOverScreen: document.getElementById('gameover-screen'),
    gameOverTitle: document.getElementById('gameover-title'),
    gameOverStats: document.getElementById('gameover-stats'),
  };

  const engine = new BreakoutEngine(canvas, uiElements);

  // Sound Mute button
  const btnSound = document.getElementById('btn-sound');
  function updateSoundIcon(muted) {
    if (!btnSound) return;
    if (muted) {
      btnSound.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      `;
    } else {
      btnSound.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
    }
  }
  updateSoundIcon(sound.muted);

  btnSound?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    const muted = sound.toggleMute();
    updateSoundIcon(muted);
  });

  // Pause button
  const btnPause = document.getElementById('btn-pause');
  btnPause?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    engine.togglePause();
  });

  // Start button
  const btnStart = document.getElementById('btn-start');
  btnStart?.addEventListener('click', () => {
    sound.ensureContext();
    engine.startGame();
  });

  // Resume button
  const btnResume = document.getElementById('btn-resume');
  btnResume?.addEventListener('click', () => {
    engine.setGameState('playing');
  });

  // Restart button
  const btnRestart = document.getElementById('btn-restart');
  btnRestart?.addEventListener('click', () => {
    engine.startGame();
  });

  // To Title button
  const btnToTitle = document.getElementById('btn-to-title');
  btnToTitle?.addEventListener('click', () => {
    engine.setGameState('title');
  });

  // Next stage button
  const btnNextStage = document.getElementById('btn-next-stage');
  btnNextStage?.addEventListener('click', () => {
    engine.nextStage();
  });

  // Play again button
  const btnPlayAgain = document.getElementById('btn-play-again');
  btnPlayAgain?.addEventListener('click', () => {
    engine.startGame();
  });

  // GameOver to Title button
  const btnGameOverToTitle = document.getElementById('btn-gameover-to-title');
  btnGameOverToTitle?.addEventListener('click', () => {
    engine.setGameState('title');
  });

  // Difficulty selection buttons
  const diffButtons = document.querySelectorAll('.diff-btn');
  diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      diffButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const diff = btn.dataset.diff || 'normal';
      engine.setDifficulty(diff);
    });
  });

  // Mouse / Pointer Controls
  canvasWrapper.addEventListener('pointermove', (e) => {
    if (engine.state !== 'playing') return;
    const pos = engine.screenToCanvas(e.clientX, e.clientY);
    engine.pointerX = pos.x;
    engine.isPointerControlling = true;
  });

  canvasWrapper.addEventListener('pointerdown', (e) => {
    sound.ensureContext();
    if (engine.state === 'playing') {
      if (engine.ballStuckToPaddle) {
        engine.launchBall();
      } else if (engine.paddle.laserTimer > 0) {
        engine.fireLaser();
      }
    }
  });

  // Keyboard Controls
  window.addEventListener('keydown', (e) => {
    if (e.repeat && e.code !== 'Space') return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      engine.keys.left = true;
      engine.isPointerControlling = false;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      engine.keys.right = true;
      engine.isPointerControlling = false;
    } else if (e.code === 'Space') {
      e.preventDefault();
      sound.ensureContext();
      if (engine.state === 'title') {
        engine.startGame();
      } else if (engine.state === 'playing') {
        if (engine.ballStuckToPaddle) {
          engine.launchBall();
        } else if (engine.paddle.laserTimer > 0) {
          engine.fireLaser();
        }
      } else if (engine.state === 'stage_clear') {
        engine.nextStage();
      } else if (engine.state === 'gameover') {
        engine.startGame();
      }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      engine.togglePause();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      const muted = sound.toggleMute();
      updateSoundIcon(muted);
    } else if (e.code === 'KeyR') {
      if (engine.state === 'playing' || engine.state === 'paused') {
        engine.startGame();
      }
    } else if (e.code === 'Enter') {
      if (engine.state === 'title') {
        engine.startGame();
      } else if (engine.state === 'stage_clear') {
        engine.nextStage();
      } else if (engine.state === 'gameover') {
        engine.startGame();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      engine.keys.left = false;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      engine.keys.right = false;
    }
  });

  // Focus-loss hygiene
  window.addEventListener('blur', () => {
    engine.keys.left = false;
    engine.keys.right = false;
  });

  // Mobile Touch Controls
  const btnTouchLeft = document.getElementById('btn-touch-left');
  const btnTouchRight = document.getElementById('btn-touch-right');
  const btnTouchAction = document.getElementById('btn-touch-action');

  btnTouchLeft?.addEventListener('pointerdown', () => {
    engine.keys.left = true;
    engine.isPointerControlling = false;
  });
  btnTouchLeft?.addEventListener('pointerup', () => {
    engine.keys.left = false;
  });
  btnTouchLeft?.addEventListener('pointercancel', () => {
    engine.keys.left = false;
  });

  btnTouchRight?.addEventListener('pointerdown', () => {
    engine.keys.right = true;
    engine.isPointerControlling = false;
  });
  btnTouchRight?.addEventListener('pointerup', () => {
    engine.keys.right = false;
  });
  btnTouchRight?.addEventListener('pointercancel', () => {
    engine.keys.right = false;
  });

  btnTouchAction?.addEventListener('click', () => {
    sound.ensureContext();
    if (engine.state === 'playing') {
      if (engine.ballStuckToPaddle) {
        engine.launchBall();
      } else if (engine.paddle.laserTimer > 0) {
        engine.fireLaser();
      }
    } else if (engine.state === 'title') {
      engine.startGame();
    } else if (engine.state === 'stage_clear') {
      engine.nextStage();
    } else if (engine.state === 'gameover') {
      engine.startGame();
    }
  });

  // Support ?autostart=1 parameter
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autostart') === '1') {
    engine.startGame('normal');
    engine.launchBall();
  }

  // Start engine animation loop
  engine.startLoop();
});
