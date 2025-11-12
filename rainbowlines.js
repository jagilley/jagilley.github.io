// Modern Flowing Rainbow Lines Animation
// Dense, vibrant, smooth curves

let w = c.width = window.innerWidth;
let h = c.height = window.innerHeight;
const ctx = c.getContext('2d');

// Configuration - More lines, more density, more vibrant!
const config = {
  maxLines: 120,
  initialLines: 12,
  lineWidth: 3,
  speed: 2.5,
  curviness: 0.08,
  branchProbability: 0.4,
  deathProbability: 0.15,
  trailFade: 0.025,
  spawnInterval: 8,
  maxSegmentLength: 25,
  minSegmentLength: 15,
  colorSpeed: 0.8
};

let lines = [];
let frame = 0;
let timeSinceLast = 0;

// Central spawning point
const center = {
  x: w / 2,
  y: h / 2
};

class Line {
  constructor(parent) {
    this.x = parent.x;
    this.y = parent.y;
    this.prevX = this.x;
    this.prevY = this.y;

    // Start with parent's angle but with some variation
    if (parent.angle !== undefined) {
      this.angle = parent.angle + (Math.random() - 0.5) * 1.2;
    } else {
      // Initial lines spread in all directions
      this.angle = Math.random() * Math.PI * 2;
    }

    this.width = parent.width ? parent.width * 0.92 : config.lineWidth;
    this.hue = parent.hue !== undefined ? parent.hue : Math.random() * 360;
    this.segmentLength = config.minSegmentLength + Math.random() * (config.maxSegmentLength - config.minSegmentLength);
    this.distanceLeft = this.segmentLength;
    this.generation = parent.generation !== undefined ? parent.generation + 1 : 0;
  }

  update() {
    this.prevX = this.x;
    this.prevY = this.y;

    // Smooth curve changes
    this.angle += (Math.random() - 0.5) * config.curviness;

    // Move in current direction
    this.x += Math.cos(this.angle) * config.speed;
    this.y += Math.sin(this.angle) * config.speed;

    // Update color
    this.hue = (this.hue + config.colorSpeed) % 360;

    this.distanceLeft -= config.speed;
  }

  draw() {
    // High saturation, vibrant colors
    const saturation = 90;
    const lightness = 60;
    const alpha = 0.85;

    ctx.strokeStyle = `hsla(${this.hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    ctx.lineWidth = this.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Add glow for premium look
    ctx.shadowBlur = 8;
    ctx.shadowColor = `hsla(${this.hue}, ${saturation}%, ${lightness}%, 0.6)`;

    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  shouldBranch() {
    return this.distanceLeft <= 0 &&
           this.width > 0.5 &&
           this.generation < 8;
  }

  isDead() {
    // Die if off screen or naturally
    if (this.x < -100 || this.x > w + 100 ||
        this.y < -100 || this.y > h + 100) {
      return true;
    }

    if (this.distanceLeft <= 0 && Math.random() < config.deathProbability) {
      return true;
    }

    return false;
  }
}

function init() {
  lines = [];
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Start with more initial lines
  for (let i = 0; i < config.initialLines; i++) {
    lines.push(new Line({
      x: center.x,
      y: center.y,
      width: config.lineWidth,
      generation: 0
    }));
  }
}

function animate() {
  requestAnimationFrame(animate);

  frame++;
  timeSinceLast++;

  // Subtle fade for trails
  ctx.fillStyle = `rgba(0, 0, 0, ${config.trailFade})`;
  ctx.fillRect(0, 0, w, h);

  // Update and draw all lines
  for (let i = lines.length - 1; i >= 0; i--) {
    lines[i].update();
    lines[i].draw();

    // Check for branching
    if (lines[i].shouldBranch()) {
      lines[i].distanceLeft = lines[i].segmentLength;

      // Create 1-2 branches
      if (lines.length < config.maxLines) {
        lines.push(new Line(lines[i]));

        if (Math.random() < config.branchProbability && lines.length < config.maxLines) {
          lines.push(new Line(lines[i]));
        }
      }
    }

    // Remove dead lines
    if (lines[i].isDead()) {
      lines.splice(i, 1);
    }
  }

  // Spawn new lines from center
  if (lines.length < config.maxLines &&
      timeSinceLast > config.spawnInterval &&
      Math.random() < 0.6) {
    lines.push(new Line({
      x: center.x,
      y: center.y,
      width: config.lineWidth,
      generation: 0
    }));
    timeSinceLast = 0;

    // Draw a glow at center
    const hue = frame % 360;
    ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.3)`;
    ctx.shadowBlur = 20;
    ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.5)`;
    ctx.beginPath();
    ctx.arc(center.x, center.y, config.lineWidth * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Handle window resize
window.addEventListener('resize', () => {
  w = c.width = window.innerWidth;
  h = c.height = window.innerHeight;
  center.x = w / 2;
  center.y = h / 2;
  init();
});

// Start animation
init();
animate();