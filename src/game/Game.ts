export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  private readonly stepMs = 1000 / 60;

  private x = 0;
  private y = 0;
  private vx = 120;
  private vy = 90;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context not supported');
    }
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
  }

  private readonly loop = (time: number): void => {
    if (!this.running) return;

    let frameTime = time - this.lastTime;
    this.lastTime = time;
    if (frameTime > 250) frameTime = 250;

    this.accumulator += frameTime;
    while (this.accumulator >= this.stepMs) {
      this.update(this.stepMs / 1000);
      this.accumulator -= this.stepMs;
    }

    this.render();
    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const size = 24;
    if (this.x <= 0 || this.x + size >= this.canvas.width) {
      this.vx *= -1;
    }
    if (this.y <= 0 || this.y + size >= this.canvas.height) {
      this.vy *= -1;
    }
  }

  private render(): void {
    const { ctx } = this;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#4a90e2';
    ctx.fillRect(this.x, this.y, 24, 24);
  }
}
