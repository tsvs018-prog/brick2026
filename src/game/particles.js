/**
 * High-performance, zero-garbage particle pool and floating score text system.
 */

const MAX_PARTICLES = 400;
const MAX_FLOATING_TEXTS = 30;

class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.size = 3;
    this.color = '#00f3ff';
    this.alpha = 1;
    this.life = 0;
    this.maxLife = 0.5;
    this.shape = 'circle'; // 'circle', 'spark', 'smoke'
  }
}

class FloatingText {
  constructor() {
    this.active = false;
    this.text = '';
    this.x = 0;
    this.y = 0;
    this.vy = -35;
    this.color = '#fff';
    this.size = 14;
    this.alpha = 1;
    this.life = 0;
    this.maxLife = 0.8;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => new Particle());
    this.texts = Array.from({ length: MAX_FLOATING_TEXTS }, () => new FloatingText());
    this.shakeIntensity = 0;
    this.shakeDecay = 10;
  }

  addScreenShake(amount = 8) {
    this.shakeIntensity = Math.min(this.shakeIntensity + amount, 20);
  }

  getShakeOffset() {
    if (this.shakeIntensity <= 0.05) return { x: 0, y: 0 };
    const angle = Math.random() * Math.PI * 2;
    const dist = this.shakeIntensity * (0.5 + Math.random() * 0.5);
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  spawnBurst(x, y, color = '#00f3ff', count = 16, speed = 180) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        const angle = Math.random() * Math.PI * 2;
        const v = (0.3 + Math.random() * 0.7) * speed;
        p.vx = Math.cos(angle) * v;
        p.vy = Math.sin(angle) * v;
        p.size = 2.5 + Math.random() * 3.5;
        p.color = color;
        p.alpha = 1;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.35;
        p.shape = Math.random() > 0.4 ? 'circle' : 'spark';
        spawned++;
      }
    }
  }

  spawnExplosion(x, y, radius = 50) {
    this.addScreenShake(10);
    this.spawnBurst(x, y, '#ff0055', 30, 260);
    this.spawnBurst(x, y, '#ffb800', 25, 200);
    this.spawnBurst(x, y, '#ffffff', 15, 320);
  }

  spawnBallTrail(x, y, color = '#00f3ff') {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 4;
        p.y = y + (Math.random() - 0.5) * 4;
        p.vx = (Math.random() - 0.5) * 20;
        p.vy = (Math.random() - 0.5) * 20;
        p.size = 3.5;
        p.color = color;
        p.alpha = 0.7;
        p.life = 0;
        p.maxLife = 0.18;
        p.shape = 'circle';
        break;
      }
    }
  }

  spawnFloatingText(x, y, text, color = '#ffd700', size = 15) {
    for (let i = 0; i < this.texts.length; i++) {
      const ft = this.texts[i];
      if (!ft.active) {
        ft.active = true;
        ft.text = text;
        ft.x = x;
        ft.y = y;
        ft.vy = -45;
        ft.color = color;
        ft.size = size;
        ft.alpha = 1;
        ft.life = 0;
        ft.maxLife = 0.85;
        break;
      }
    }
  }

  update(dt) {
    // Screen shake decay
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    }

    // Particles update
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 1.8 * dt);
      p.vy += 120 * dt; // slight gravity
      p.alpha = 1 - (p.life / p.maxLife);
    }

    // Texts update
    for (let i = 0; i < this.texts.length; i++) {
      const ft = this.texts[i];
      if (!ft.active) continue;

      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        ft.active = false;
        continue;
      }

      ft.y += ft.vy * dt;
      ft.alpha = 1 - (ft.life / ft.maxLife);
    }
  }

  render(ctx) {
    ctx.save();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;

      if (p.shape === 'spark') {
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render floating texts with outer shadow
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    for (let i = 0; i < this.texts.length; i++) {
      const ft = this.texts[i];
      if (!ft.active) continue;

      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `bold ${ft.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      // Glow outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);

      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }

    ctx.restore();
  }

  reset() {
    this.particles.forEach(p => (p.active = false));
    this.texts.forEach(t => (t.active = false));
    this.shakeIntensity = 0;
  }
}
