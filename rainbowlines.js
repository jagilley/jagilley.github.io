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
  trailFade: 0.05,
  spawnInterval: 8,
  maxSegmentLength: 25,
  minSegmentLength: 15,
  colorSpeed: 0.8
};

let lines = [];
let frame = 0;
let timeSinceLast = 0;
let startTime = Date.now();

// Central spawning point
const center = {
  x: w / 2,
  y: h / 2
};

// Big bang effect - subtle initial burst
function getBigBangMultiplier() {
  const elapsed = (Date.now() - startTime) / 1000; // seconds since start
  const decayDuration = 0.5; // 0.5 seconds to settle

  if (elapsed >= decayDuration) return 1.0;

  // Smooth decay from 2x to 1x
  const progress = elapsed / decayDuration;
  return 2.0 - (1.0 * Math.pow(progress, 1.5));
}

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

    // Move in current direction with big bang multiplier
    const speedMultiplier = getBigBangMultiplier();
    const currentSpeed = config.speed * speedMultiplier;
    this.x += Math.cos(this.angle) * currentSpeed;
    this.y += Math.sin(this.angle) * currentSpeed;

    // Update color - faster during big bang
    this.hue = (this.hue + config.colorSpeed * speedMultiplier) % 360;

    this.distanceLeft -= currentSpeed;
  }

  draw() {
    // High saturation, vibrant colors - fully opaque for clean fading
    const saturation = 90;
    const lightness = 60;

    ctx.strokeStyle = `hsl(${this.hue}, ${saturation}%, ${lightness}%)`;
    ctx.lineWidth = this.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(this.prevX, this.prevY);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
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
  startTime = Date.now(); // Reset big bang timer
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  // Start with more initial lines for big bang
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

  // Fade for trails - tuned to prevent ghost accumulation
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

  // Spawn new lines from center - faster during big bang
  const spawnMultiplier = getBigBangMultiplier();
  const spawnThreshold = config.spawnInterval / spawnMultiplier;

  if (lines.length < config.maxLines &&
      timeSinceLast > spawnThreshold &&
      Math.random() < 0.6) {
    lines.push(new Line({
      x: center.x,
      y: center.y,
      width: config.lineWidth,
      generation: 0
    }));
    timeSinceLast = 0;

    // Draw a dot at center
    const hue = frame % 360;
    ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(center.x, center.y, config.lineWidth * 2, 0, Math.PI * 2);
    ctx.fill();
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