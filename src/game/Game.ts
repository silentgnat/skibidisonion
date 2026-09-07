import { Sfx } from './sound.ts';

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface StepResult {
  approach: number;
  ink: boolean;
}

interface Dropper extends Body {
  alive: boolean;
  respawnTimer: number;
  spawnVx: number;
  spawnVy: number;
  bounceBonus: number;
  stuckTimer: number;
  color: string;
  gold: boolean;
  producer: Producer | null;
  trailPts: { x: number; y: number }[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  maxR: number;
  born: number;
  life: number;
  color: string;
  width: number;
}

type Splat =
  | { kind: 'blob'; born: number; x: number; y: number; size: number; color: string; alpha: number }
  | {
      kind: 'streak';
      born: number;
      x: number;
      y: number;
      length: number;
      width: number;
      angle: number;
      color: string;
      alpha: number;
    }
  | {
      kind: 'drip';
      born: number;
      x: number;
      y: number;
      width: number;
      color: string;
      alpha: number;
      speed: number;
      vy: number;
      contact: boolean;
      startY: number;
    };

interface WorldStain {
  x: number;
  y: number;
  size: number;
  color: string;
  alpha: number;
  born: number;
}

interface Material {
  name: string;
  color: string;
  solid: boolean;
  width: number;
  alpha: number;
}

interface Upgrade {
  id: 'cash' | 'double' | 'map';
  name: string;
  desc: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
  level: number;
}

interface Fan {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  powerLv: number;
  reachLv: number;
}

interface Producer {
  x: number;
  y: number;
  speedLv: number;
  countLv: number;
  trailLv: number;
}

type ObjectTool = 'pen' | 'fan' | 'producer' | 'destroyer';

interface DropperSave {
  x?: number;
  y?: number;
  spawnVx: number;
  spawnVy: number;
  color: string;
  gold?: boolean;
  producer?: number;
}

interface ProducerSave {
  x: number;
  y: number;
  speedLv?: number;
  countLv?: number;
  trailLv?: number;
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly layer: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;
  private readonly solidLayer: HTMLCanvasElement;
  private readonly solidCtx: CanvasRenderingContext2D;
  private readonly bloodLayer: HTMLCanvasElement;
  private readonly bloodCtx: CanvasRenderingContext2D;
  private shake = 0;
  private settingsOpen = false;
  private upgradesOpen = false;
  private upgradeScroll = 0;
  private bloodDuration = 15;
  private bloodAmount = 3;
  private readonly sfx = new Sfx();
  private readonly saveKey = 'skibidisonion-save-v1';
  private saveTimer = 2;
  private saveDirty = false;
  private inkDirty = false;
  private inkEpoch = 0;
  private bounceSoundTimer = 0;
  private borderSoundTimer = 0;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  private readonly stepMs = 1000 / 60;

  private readonly blockSize = 24;
  private readonly bouncer: Body = { x: 0, y: 0, vx: 120, vy: 90 };

  private readonly gravity = 900;
  private readonly maxFall = 1400;
  private readonly settleSpeed = 80;
  private readonly bounciness = 0.55;
  private readonly friction = 0.82;
  private readonly frictionStop = 55;
  private readonly topMatHeight = this.blockSize * 3 + 8;
  private rewardPerDeath = 5;
  private money = 0;

  private readonly materials: readonly Material[] = [
    { name: 'ink', color: '#9e9e9e', solid: true, width: 12, alpha: 1 },
  ];
  private material = 0;

  private readonly objectTools: ReadonlyArray<{ id: ObjectTool; name: string }> = [
    { id: 'pen', name: 'Ink Pen' },
    { id: 'fan', name: 'Fan' },
    { id: 'producer', name: 'Producer' },
    { id: 'destroyer', name: 'Extra Bouncer' },
  ];
  private objectMode: ObjectTool = 'pen';
  private objectsOpen = false;
  private secretOpen = false;
  private freePlace = false;

  private readonly fanSize = 30;
  private readonly fanRangeBase = 160;
  private readonly fanRangeGrowth = 1.12;
  private readonly fanPowerBase = 2800;
  private readonly fanPowerGrowth = 1.5;
  private readonly fanMaxSpeed = 1300;
  private readonly fanCost = 10000;
  private readonly extraBouncerCost = 50000;
  private readonly fanReachUpBase = 12000;
  private readonly fanReachUpGrowth = 1.9;
  private readonly fanPowerUpBase = 15000;
  private readonly fanPowerUpGrowth = 1.9;
  private readonly fans: Fan[] = [];
  private fanDrag: { x: number; y: number } | null = null;
  private bouncerDrag: { x: number; y: number } | null = null;
  private draggedFan: Fan | null = null;
  private hoveredFanIndex = -1;
  private selectedFan: Fan | null = null;

  private readonly producerW = 56;
  private readonly producerH = 64;
  private readonly producerCost = 50000;
  private readonly producerSpeedBase = 75;
  private readonly producerSpeedGrowth = 1.9;
  private readonly producerCountBase = 250;
  private readonly producerCountGrowth = 2.2;
  private readonly producerTrailBase = 300;
  private readonly producerTrailGrowth = 1.9;
  private readonly producers: Producer[] = [];
  private producerDrag: { x: number; y: number } | null = null;
  private draggedProducer: Producer | null = null;
  private selectedProducer: Producer | null = null;
  private hoveredProducerIndex = -1;

  private readonly upgrades: readonly Upgrade[] = [
    { id: 'cash', name: 'Cash Boost', desc: '+$5 per death', baseCost: 50, growth: 1.9, maxLevel: Infinity, level: 0 },
    { id: 'double', name: 'Double Kill', desc: '+15% double money', baseCost: 100, growth: 1.9, maxLevel: Infinity, level: 0 },
    { id: 'map', name: 'Bigger Map', desc: '+50% map size', baseCost: 300, growth: 2.2, maxLevel: Infinity, level: 0 },
  ];

  private readonly droppers: Dropper[] = [];
  private readonly extraBouncers: Body[] = [];
  private time = 0;
  private readonly particles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly splats: Splat[] = [];
  private readonly worldStains: WorldStain[] = [];

  private deviceScale = 1;

  private readonly maxWorldDim = 8192;
  private worldW = 0;
  private worldH = 0;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private panActive = false;
  private panStartX = 0;
  private panStartY = 0;
  private camStartX = 0;
  private camStartY = 0;

  private drawing = false;
  private erasing = false;
  private readonly eraserWidth = 42;
  private mouseX = 0;
  private mouseY = 0;
  private drawX = 0;
  private drawY = 0;
  private drawWidth = 0;
  private dragged: Body | null = null;
  private storedVx = 0;
  private storedVy = 0;
  private tearTimer = 2;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D context not supported');
    }
    this.ctx = ctx;

    this.layer = document.createElement('canvas');
    const layerCtx = this.layer.getContext('2d');
    if (!layerCtx) {
      throw new Error('2D context not supported');
    }
    this.layerCtx = layerCtx;

    this.solidLayer = document.createElement('canvas');
    const solidCtx = this.solidLayer.getContext('2d');
    if (!solidCtx) {
      throw new Error('2D context not supported');
    }
    this.solidCtx = solidCtx;

    this.bloodLayer = document.createElement('canvas');
    const bloodCtx = this.bloodLayer.getContext('2d');
    if (!bloodCtx) {
      throw new Error('2D context not supported');
    }
    this.bloodCtx = bloodCtx;

    this.resize();
    this.bouncer.y = Math.round(this.worldH / 2 - this.blockSize / 2);
    this.bouncer.x = Math.round(this.worldW / 2 - this.blockSize / 2);
    this.mouseX = this.canvas.width / 2;
    this.mouseY = this.canvas.height / 2;
    this.createProducer(Math.round(this.worldW / 2 - this.producerW / 2), 8);
    this.loadSave();
    this.applyWorldSize();
    this.centerCamera();

    window.addEventListener('resize', this.resize);
    window.addEventListener('beforeunload', this.flushSave);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.sfx.ensure();
    const key = e.key.toLowerCase();
    if (key === 'r') {
      this.layerCtx.clearRect(0, 0, this.layer.width, this.layer.height);
      this.solidCtx.clearRect(0, 0, this.solidLayer.width, this.solidLayer.height);
      this.bloodCtx.clearRect(0, 0, this.bloodLayer.width, this.bloodLayer.height);
      this.splats.length = 0;
      this.worldStains.length = 0;
      this.inkEpoch++;
      this.markInkDirty();
    } else if (key === 'e') {
      this.erasing = !this.erasing;
      if (this.drawing) {
        this.drawing = false;
        this.sfx.stopDraw();
      }
    } else if (key === 'm') {
      this.sfx.toggle();
    } else if (key === 'arrowleft' || key === 'arrowright') {
      e.preventDefault();
      const w = this.mouseWorldPoint();
      const fi = this.hitFanPoint(w.x, w.y);
      if (fi >= 0) {
        this.rotateFan(this.fans[fi], key === 'arrowleft' ? -1 : 1);
      }
    }
  };

  private mouseWorldPoint(): { x: number; y: number } {
    return { x: this.mouseX / this.zoom + this.camX, y: this.mouseY / this.zoom + this.camY };
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.flushSave();
    }
  };

  private loadSave(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.saveKey);
    } catch {
      return;
    }
    if (!raw) return;
    let data: {
      money?: number;
      upgrades?: Record<string, number>;
      bloodDuration?: number;
      bloodAmount?: number;
      soundVolume?: number;
      ink?: { layer?: string; solid?: string; blood?: string };
      droppers?: DropperSave[];
      bouncer?: { x: number; y: number };
      extraBouncers?: { x: number; y: number }[];
      fans?: { x: number; y: number; dirX: number; dirY: number; powerLv?: number; reachLv?: number }[];
      producers?: ProducerSave[];
    };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof data.money === 'number') {
      this.money = data.money;
    }
    if (data.upgrades) {
      for (const up of this.upgrades) {
        const lv = data.upgrades[up.id];
        if (typeof lv === 'number' && lv >= 0) {
          up.level = lv;
        }
      }
    }
    this.rewardPerDeath = 5 + 5 * (this.upgrades.find((u) => u.id === 'cash')?.level ?? 0);
    this.applyWorldSize();
    const savedProducers = data.producers;
    if (savedProducers && savedProducers.length > 0) {
      this.producers.length = 0;
      this.droppers.length = 0;
      for (const sp of savedProducers) {
        if (typeof sp.x !== 'number' || typeof sp.y !== 'number') continue;
        const pos = this.clampProducerPos(sp.x, sp.y);
        this.producers.push({
          x: pos.x,
          y: pos.y,
          speedLv: typeof sp.speedLv === 'number' && sp.speedLv >= 0 ? Math.floor(sp.speedLv) : 0,
          countLv: typeof sp.countLv === 'number' && sp.countLv >= 0 ? Math.floor(sp.countLv) : 0,
          trailLv: typeof sp.trailLv === 'number' && sp.trailLv >= 0 ? Math.floor(sp.trailLv) : 0,
        });
      }
    }
    const savedDroppers = data.droppers ?? [];
    for (const sd of savedDroppers) {
      if (typeof sd.spawnVx !== 'number' || typeof sd.spawnVy !== 'number') continue;
      if (typeof sd.producer !== 'number' || sd.producer < 0 || sd.producer >= this.producers.length) continue;
      const p = this.producers[sd.producer];
      this.droppers.push(this.createDropper(p, sd));
    }
    for (const p of this.producers) {
      const want = 1 + p.countLv;
      let have = 0;
      for (let i = this.droppers.length - 1; i >= 0; i--) {
        const d = this.droppers[i];
        if (d.producer !== p) continue;
        have++;
        if (have > want) {
          this.droppers.splice(i, 1);
        }
      }
      while (have < want) {
        this.droppers.push(this.createDropper(p));
        have++;
      }
    }
    if (typeof data.bloodDuration === 'number') {
      this.bloodDuration = Math.min(30, Math.max(5, data.bloodDuration));
    }
    if (typeof data.bloodAmount === 'number') {
      this.bloodAmount = Math.min(3, Math.max(0.5, data.bloodAmount));
    }
    if (typeof data.soundVolume === 'number') {
      this.sfx.setVolume(Math.min(500, Math.max(0, data.soundVolume)));
    }
    if (data.ink) {
      this.restoreLayer(this.layer, this.layerCtx, data.ink.layer);
      this.restoreLayer(this.solidLayer, this.solidCtx, data.ink.solid);
    }
    if (data.bouncer && typeof data.bouncer.x === 'number' && typeof data.bouncer.y === 'number') {
      this.bouncer.x = Math.min(Math.max(data.bouncer.x, 0), this.worldW - this.blockSize);
      this.bouncer.y = Math.min(Math.max(data.bouncer.y, this.topMatHeight), this.worldH - this.blockSize);
    }
    const savedExtra = data.extraBouncers ?? [];
    for (const se of savedExtra) {
      if (typeof se.x !== 'number' || typeof se.y !== 'number') continue;
      const b = this.createExtraBouncer();
      b.x = Math.min(Math.max(se.x, 0), this.worldW - this.blockSize);
      b.y = Math.min(Math.max(se.y, this.topMatHeight), this.worldH - this.blockSize);
      this.extraBouncers.push(b);
    }
    const savedFans = data.fans ?? [];
    for (const sf of savedFans) {
      if (typeof sf.x !== 'number' || typeof sf.y !== 'number') continue;
      const pos = this.clampFanPos(sf.x, sf.y);
      let dx = 1;
      let dy = 0;
      if (typeof sf.dirX === 'number' && typeof sf.dirY === 'number') {
        const len = Math.hypot(sf.dirX, sf.dirY);
        if (len > 0) {
          dx = sf.dirX / len;
          dy = sf.dirY / len;
        }
      }
    this.fans.push({
        x: pos.x,
        y: pos.y,
        dirX: dx,
        dirY: dy,
        powerLv: typeof sf.powerLv === 'number' ? sf.powerLv : 0,
        reachLv: typeof sf.reachLv === 'number' ? sf.reachLv : 0,
      });
    }
  }

  private restoreLayer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, dataUrl?: string): void {
    if (!dataUrl) return;
    const epoch = this.inkEpoch;
    const img = new Image();
    img.onload = () => {
      if (this.inkEpoch !== epoch) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }

  private progressData(): {
    money: number;
    upgrades: Record<string, number>;
    bloodDuration: number;
    bloodAmount: number;
    soundVolume: number;
    droppers: DropperSave[];
    bouncer: { x: number; y: number };
    extraBouncers: { x: number; y: number }[];
    fans: { x: number; y: number; dirX: number; dirY: number; powerLv: number; reachLv: number }[];
    producers: ProducerSave[];
  } {
    return {
      money: this.money,
      upgrades: Object.fromEntries(this.upgrades.map((u) => [u.id, u.level])),
      bloodDuration: this.bloodDuration,
      bloodAmount: this.bloodAmount,
      soundVolume: this.sfx.volume,
      droppers: this.droppers.map((d) => ({
        x: d.x,
        y: d.y,
        spawnVx: d.spawnVx,
        spawnVy: d.spawnVy,
        color: d.color,
        gold: d.gold,
        producer: d.producer ? this.producers.indexOf(d.producer) : -1,
      })),
      bouncer: { x: this.bouncer.x, y: this.bouncer.y },
      extraBouncers: this.extraBouncers.map((b) => ({ x: b.x, y: b.y })),
      fans: this.fans.map((f) => ({ x: f.x, y: f.y, dirX: f.dirX, dirY: f.dirY, powerLv: f.powerLv, reachLv: f.reachLv })),
      producers: this.producers.map((p) => ({ x: p.x, y: p.y, speedLv: p.speedLv, countLv: p.countLv, trailLv: p.trailLv })),
    };
  }

  private readonly flushSave = (): void => {
    if (!this.saveDirty) return;
    this.saveDirty = false;
    void this.save();
  };

  private mapScale(): number {
    const level = this.upgrades.find((u) => u.id === 'map')?.level ?? 0;
    const scale = 1 + 0.5 * level;
    const capW = Math.max(1, this.maxWorldDim / this.canvas.width);
    const capH = Math.max(1, this.maxWorldDim / this.canvas.height);
    return Math.min(scale, capW, capH);
  }

  private mapCapped(): boolean {
    const level = this.upgrades.find((u) => u.id === 'map')?.level ?? 0;
    return 1 + 0.5 * level > this.mapScale();
  }

  private applyWorldSize(): void {
    const ww = Math.round(this.canvas.width * this.mapScale());
    const wh = Math.round(this.canvas.height * this.mapScale());
    if (ww === this.worldW && wh === this.worldH) {
      return;
    }
    const prevW = this.layer.width;
    const prevH = this.layer.height;
    this.worldW = ww;
    this.worldH = wh;
    this.expandLayer(this.layer, this.layerCtx, prevW, prevH, ww, wh);
    this.expandLayer(this.solidLayer, this.solidCtx, prevW, prevH, ww, wh);
    this.expandLayer(this.bloodLayer, this.bloodCtx, prevW, prevH, ww, wh);
    this.clampCamera();
  }

  private expandLayer(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    prevW: number,
    prevH: number,
    targetW: number,
    targetH: number,
  ): void {
    const prev = document.createElement('canvas');
    prev.width = prevW;
    prev.height = prevH;
    const prevCtx = prev.getContext('2d');
    if (prevCtx) {
      prevCtx.drawImage(canvas, 0, 0);
    }
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(prev, 0, 0);
  }

  private clampCamera(): void {
    const vw = this.canvas.width / this.zoom;
    const vh = this.canvas.height / this.zoom;
    this.camX = Math.min(Math.max(this.camX, 0), Math.max(0, this.worldW - vw));
    this.camY = Math.min(Math.max(this.camY, 0), Math.max(0, this.worldH - vh));
  }

  private centerCamera(): void {
    this.camX = Math.max(0, (this.worldW - this.canvas.width) / 2);
    this.camY = Math.max(0, (this.worldH - this.canvas.height) / 2);
    this.clampCamera();
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.toDevicePoint(e);
    if (this.upgradesOpen && this.pointInUpgradePanel(p.x, p.y)) {
      const amount =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * this.canvas.height : e.deltaY;
      this.upgradeScroll = Math.min(this.upgradeMaxScroll(), Math.max(0, this.upgradeScroll + amount));
      return;
    }
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const fit = Math.min(this.canvas.width / this.worldW, this.canvas.height / this.worldH);
    const newZoom = Math.min(4, Math.max(Math.max(0.15, fit), this.zoom * factor));
    if (newZoom === this.zoom) return;
    const wx = p.x / this.zoom + this.camX;
    const wy = p.y / this.zoom + this.camY;
    this.zoom = newZoom;
    this.camX = wx - p.x / this.zoom;
    this.camY = wy - p.y / this.zoom;
    this.clampCamera();
  };

  private async save(): Promise<void> {
    const progress = this.progressData();
    const encode = (c: HTMLCanvasElement): Promise<string> =>
      new Promise((resolve) => {
        const maxDim = 4096;
        let src: HTMLCanvasElement = c;
        const scale = Math.min(1, maxDim / Math.max(c.width, c.height));
        if (scale < 1) {
          const small = document.createElement('canvas');
          small.width = Math.max(1, Math.round(c.width * scale));
          small.height = Math.max(1, Math.round(c.height * scale));
          small.getContext('2d')?.drawImage(c, 0, 0, small.width, small.height);
          src = small;
        }
        src.toBlob((b) => {
          if (!b) {
            resolve('');
            return;
          }
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
          r.onerror = () => resolve('');
          r.readAsDataURL(b);
        }, 'image/png');
      });
    const withInk = this.inkDirty;
    let wrote = false;
    try {
      if (withInk) {
        const [layer, solid] = await Promise.all([encode(this.layer), encode(this.solidLayer)]);
        localStorage.setItem(this.saveKey, JSON.stringify({ ...progress, ink: { layer, solid } }));
        this.inkDirty = false;
      } else {
        const savedInk = this.readSavedInk();
        localStorage.setItem(this.saveKey, JSON.stringify(savedInk ? { ...progress, ink: savedInk } : progress));
        this.inkDirty = false;
      }
      wrote = true;
    } catch {
      // storage quota exceeded; fall through to progress-only
    }
    if (!wrote) {
      try {
        const savedInk = this.readSavedInk();
        localStorage.setItem(this.saveKey, JSON.stringify(savedInk ? { ...progress, ink: savedInk } : progress));
      } catch {
        // storage unavailable
      }
    }
  }

  private readSavedInk(): { layer?: string; solid?: string } | undefined {
    try {
      const prev: { ink?: { layer?: string; solid?: string } } = JSON.parse(localStorage.getItem(this.saveKey) ?? '');
      return prev?.ink;
    } catch {
      return undefined;
    }
  }

  private markSaveDirty(): void {
    this.saveTimer = 2;
    this.saveDirty = true;
  }

  private markInkDirty(): void {
    this.saveTimer = 2;
    this.saveDirty = true;
    this.inkDirty = true;
  }

  private resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const oldW = this.canvas.width;
    const oldH = this.canvas.height;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.deviceScale = this.canvas.width / (this.canvas.clientWidth || 1);

    if (this.worldW === 0) {
      this.applyWorldSize();
      return;
    }

    if (oldW > 0 && oldH > 0) {
      const s = Math.min(this.canvas.width / oldW, this.canvas.height / oldH);
      const fit = Math.min(this.canvas.width / this.worldW, this.canvas.height / this.worldH);
      this.zoom = Math.min(4, Math.max(fit, this.zoom * s));
      this.clampCamera();
    }
    this.clampUpgradeScroll();
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

  private readonly toDevicePoint = (e: PointerEvent | WheelEvent): { x: number; y: number } => ({
    x: e.offsetX * this.deviceScale,
    y: e.offsetY * this.deviceScale,
  });

  private readonly toWorldPoint = (e: PointerEvent): { x: number; y: number } => {
    const p = this.toDevicePoint(e);
    return { x: p.x / this.zoom + this.camX, y: p.y / this.zoom + this.camY };
  };

  private pickBody(x: number, y: number): Body | null {
    const s = this.blockSize;
    const hit = (b: Body): boolean => x >= b.x && x <= b.x + s && y >= b.y && y <= b.y + s;
    for (const d of this.droppers) {
      if (d.alive && hit(d)) return d;
    }
    for (const b of this.extraBouncers) {
      if (hit(b)) return b;
    }
    if (hit(this.bouncer)) return this.bouncer;
    return null;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.sfx.ensure();
    if (e.button === 2) {
      const p = this.toDevicePoint(e);
      if (this.selectedProducer) {
        const menuHit = this.hitProducerMenu(p.x, p.y);
        if (menuHit === 'trail') {
          this.downgradeProducerTrail();
          return;
        }
        if (menuHit !== null) {
          return;
        }
      }
      const w = this.toWorldPoint(e);
      const body = this.pickBody(w.x, w.y);
      if (!body) {
        const fi = this.hitFanPoint(w.x, w.y);
        if (fi >= 0) {
          this.draggedFan = this.fans[fi];
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch {
            // pointer may already be gone
          }
          return;
        }
        const pi = this.hitProducerPoint(w.x, w.y);
        if (pi >= 0) {
          this.draggedProducer = this.producers[pi];
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch {
            // pointer may already be gone
          }
          return;
        }
        this.panActive = true;
        this.panStartX = p.x;
        this.panStartY = p.y;
        this.camStartX = this.camX;
        this.camStartY = this.camY;
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // pointer may already be gone
        }
        return;
      }
      this.dragged = body;
      this.storedVx = body.vx;
      this.storedVy = body.vy;
      body.vx = 0;
      body.vy = 0;
      const grabbedDropper = this.droppers.find((d) => d === body);
      if (grabbedDropper) {
        grabbedDropper.bounceBonus = 0;
      }
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be gone
      }
      return;
    }
    if (e.button !== 0 || this.dragged) return;

    const p = this.toDevicePoint(e);
    const hit = this.hitUpgrade(p.x, p.y);
    if (hit >= 0) {
      this.tryBuyUpgrade(hit);
      return;
    }
    if (this.hitResetButton(p.x, p.y)) {
      this.resetAll();
      return;
    }
    if (this.hitSettingsButton(p.x, p.y)) {
      this.settingsOpen = !this.settingsOpen;
      if (this.settingsOpen) {
        this.upgradesOpen = false;
        this.objectsOpen = false;
      }
      return;
    }
    if (this.hitUpgradesButton(p.x, p.y)) {
      this.upgradesOpen = !this.upgradesOpen;
      if (this.upgradesOpen) {
        this.settingsOpen = false;
        this.objectsOpen = false;
        this.clampUpgradeScroll();
      }
      return;
    }
    const ctl = this.hitSettingsControl(p.x, p.y);
    if (ctl) {
      this.applySettingsControl(ctl);
      return;
    }
    if (this.hitClearBloodButton(p.x, p.y)) {
      this.clearBlood();
      return;
    }
    if (this.hitObjectsButton(p.x, p.y)) {
      this.objectsOpen = !this.objectsOpen;
      if (this.objectsOpen) {
        this.settingsOpen = false;
        this.upgradesOpen = false;
      }
      return;
    }
    const tool = this.hitObjectRow(p.x, p.y);
    if (tool >= 0) {
      this.objectMode = this.objectTools[tool].id;
      this.objectsOpen = false;
      this.freePlace = false;
      return;
    }
    if (this.hitSecretButton(p.x, p.y)) {
      this.secretOpen = !this.secretOpen;
      if (this.secretOpen) {
        this.money = Number.MAX_SAFE_INTEGER;
      }
      return;
    }
    if (this.secretOpen) {
      const si = this.hitSecretRow(p.x, p.y);
      if (si >= 0) {
        this.selectSecretObject(si);
        return;
      }
    }

    const w = this.toWorldPoint(e);

    const menuHit = this.hitProducerMenu(p.x, p.y);
    if (menuHit === 'close') {
      this.selectedProducer = null;
      return;
    }
    if (menuHit === 'speed' || menuHit === 'count' || menuHit === 'trail') {
      this.tryBuyProducerUpgrade(menuHit);
      return;
    }

    const fanMenuHit = this.hitFanMenu(p.x, p.y);
    if (fanMenuHit === 'close') {
      this.selectedFan = null;
      return;
    }
    if (fanMenuHit === 'power' || fanMenuHit === 'reach') {
      this.tryBuyFanUpgrade(fanMenuHit);
      return;
    }

    this.drawX = w.x;
    this.drawY = w.y;

    if (this.erasing) {
      this.removeFansNear(w.x, w.y);
      this.removeProducersNear(w.x, w.y);
      this.removeExtraBouncersNear(w.x, w.y);
      this.drawing = true;
      this.inkEpoch++;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be gone
      }
      this.drawWidth = this.eraserWidth * this.deviceScale;
      this.eraseAt(w.x, w.y, w.x, w.y);
      return;
    }

    if (this.objectMode === 'pen') {
      const fi = this.hitFanPoint(w.x, w.y);
      if (fi >= 0) {
        this.selectedFan = this.selectedFan === this.fans[fi] ? null : this.fans[fi];
        this.selectedProducer = null;
        return;
      }
      const pi = this.hitProducerPoint(w.x, w.y);
      if (pi >= 0) {
        this.selectedProducer = this.selectedProducer === this.producers[pi] ? null : this.producers[pi];
        this.selectedFan = null;
        return;
      }
      this.selectedProducer = null;
      this.selectedFan = null;
    }

    if (this.objectMode === 'producer') {
      this.producerDrag = { x: w.x, y: w.y };
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be gone
      }
      return;
    }

    if (this.objectMode === 'fan') {
      this.fanDrag = { x: w.x, y: w.y };
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be gone
      }
      return;
    }

    if (this.objectMode === 'destroyer') {
      this.bouncerDrag = { x: w.x, y: w.y };
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // pointer may already be gone
      }
      return;
    }

    this.drawing = true;
    this.inkEpoch++;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer may already be gone
    }

    this.sfx.startDraw();
    const mat = this.materials[this.material];
    const color = mat.color;
    this.drawWidth = mat.width * this.deviceScale;
    const { layerCtx, solidCtx } = this;
    const pen = this.drawWidth / 2;
    layerCtx.globalAlpha = mat.alpha;
    layerCtx.lineWidth = this.drawWidth;
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';
    layerCtx.fillStyle = color;
    layerCtx.beginPath();
    layerCtx.arc(w.x, w.y, pen, 0, Math.PI * 2);
    layerCtx.fill();
    layerCtx.globalAlpha = 1;
    if (mat.solid) {
      solidCtx.lineWidth = this.drawWidth;
      solidCtx.lineCap = 'round';
      solidCtx.lineJoin = 'round';
      solidCtx.fillStyle = '#000000';
      solidCtx.beginPath();
      solidCtx.arc(w.x, w.y, pen, 0, Math.PI * 2);
      solidCtx.fill();
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.toDevicePoint(e);
    this.mouseX = p.x;
    this.mouseY = p.y;
    if (this.panActive) {
      this.camX = this.camStartX - (p.x - this.panStartX);
      this.camY = this.camStartY - (p.y - this.panStartY);
      this.clampCamera();
      return;
    }
    if (this.fanDrag) return;
    if (this.producerDrag) return;
    if (this.bouncerDrag) return;
    if (this.draggedFan) {
      const w = this.toWorldPoint(e);
      const s = this.fanSize;
      this.draggedFan.x = Math.min(Math.max(w.x - s / 2, 0), this.worldW - s);
      this.draggedFan.y = Math.min(Math.max(w.y - s / 2, 0), this.worldH - s);
      return;
    }
    if (this.draggedProducer) {
      const w = this.toWorldPoint(e);
      const pos = this.clampProducerPos(w.x - this.producerW / 2, w.y - this.producerH / 2);
      this.draggedProducer.x = pos.x;
      this.draggedProducer.y = pos.y;
      return;
    }
    if (!this.drawing && !this.dragged) return;

    const w = this.toWorldPoint(e);
    if (this.dragged) {
      const s = this.blockSize;
      const minY = this.dragged === this.bouncer || this.extraBouncers.includes(this.dragged) ? this.topMatHeight : 0;
      this.dragged.x = Math.min(Math.max(w.x - s / 2, 0), this.worldW - s);
      this.dragged.y = Math.min(Math.max(w.y - s / 2, minY), this.worldH - s);
      return;
    }

    if (this.erasing) {
      this.removeFansAlong(this.drawX, this.drawY, w.x, w.y);
      this.removeProducersAlong(this.drawX, this.drawY, w.x, w.y);
      this.removeExtraBouncersAlong(this.drawX, this.drawY, w.x, w.y);
      this.eraseAt(this.drawX, this.drawY, w.x, w.y);
      this.drawX = w.x;
      this.drawY = w.y;
      return;
    }

    const mat = this.materials[this.material];
    const color = mat.color;
    const { layerCtx, solidCtx } = this;
    layerCtx.globalAlpha = mat.alpha;
    layerCtx.lineWidth = this.drawWidth;
    layerCtx.lineCap = 'round';
    layerCtx.lineJoin = 'round';
    layerCtx.strokeStyle = color;
    layerCtx.beginPath();
    layerCtx.moveTo(this.drawX, this.drawY);
    layerCtx.lineTo(w.x, w.y);
    layerCtx.stroke();
    layerCtx.globalAlpha = 1;
    if (mat.solid) {
      solidCtx.lineWidth = this.drawWidth;
      solidCtx.lineCap = 'round';
      solidCtx.lineJoin = 'round';
      solidCtx.strokeStyle = '#000000';
      solidCtx.beginPath();
      solidCtx.moveTo(this.drawX, this.drawY);
      solidCtx.lineTo(w.x, w.y);
      solidCtx.stroke();
    }

    this.drawX = w.x;
    this.drawY = w.y;
  };

  private eraseAt(x0: number, y0: number, x1: number, y1: number): void {
    const { layerCtx, solidCtx } = this;
    layerCtx.globalCompositeOperation = 'destination-out';
    layerCtx.lineWidth = this.drawWidth;
    layerCtx.lineCap = 'round';
    layerCtx.beginPath();
    layerCtx.moveTo(x0, y0);
    layerCtx.lineTo(x1, y1);
    layerCtx.stroke();
    layerCtx.globalCompositeOperation = 'source-over';
    solidCtx.globalCompositeOperation = 'destination-out';
    solidCtx.lineWidth = this.drawWidth;
    solidCtx.lineCap = 'round';
    solidCtx.beginPath();
    solidCtx.moveTo(x0, y0);
    solidCtx.lineTo(x1, y1);
    solidCtx.stroke();
    solidCtx.globalCompositeOperation = 'source-over';
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.fanDrag) {
      if (this.placeFan(this.fanDrag.x, this.fanDrag.y)) {
        this.objectMode = 'pen';
      }
      this.fanDrag = null;
      return;
    }
    if (this.producerDrag) {
      if (this.placeProducer(this.producerDrag.x, this.producerDrag.y)) {
        this.objectMode = 'pen';
      }
      this.producerDrag = null;
      return;
    }
    if (this.bouncerDrag) {
      if (this.placeExtraBouncer(this.bouncerDrag.x, this.bouncerDrag.y)) {
        this.objectMode = 'pen';
      }
      this.bouncerDrag = null;
      return;
    }
    if (e.button === 2) {
      if (this.dragged) {
        this.dragged.vx = this.storedVx;
        this.dragged.vy = this.storedVy;
        this.dragged = null;
      }
      if (this.draggedFan) {
        this.markSaveDirty();
        this.draggedFan = null;
      }
      if (this.draggedProducer) {
        this.markSaveDirty();
        this.draggedProducer = null;
      }
      this.panActive = false;
      return;
    }
    if (this.drawing) {
      this.drawing = false;
      this.sfx.stopDraw();
      this.markInkDirty();
    }
  };

  private isClear(x: number, y: number, passFloor = false): boolean {
    const s = this.blockSize;
    if (x < 0 || y < 0 || x + s > this.worldW || (y + s > this.worldH && !passFloor)) {
      return false;
    }
    const data = this.solidCtx.getImageData(Math.round(x), Math.round(y), s, s).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return false;
    }
    return true;
  }

  private countDrawn(x0: number, y0: number, w: number, h: number): number {
    const ix0 = Math.max(0, x0);
    const iy0 = Math.max(0, y0);
    const ix1 = Math.min(this.worldW, x0 + w);
    const iy1 = Math.min(this.worldH, y0 + h);
    if (ix0 >= ix1 || iy0 >= iy1) return 0;
    const data = this.solidCtx.getImageData(ix0, iy0, ix1 - ix0, iy1 - iy0).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) n++;
    }
    return n;
  }

  private pixelNormal(body: Body): { x: number; y: number } | null {
    const m = 3;
    const s = this.blockSize;
    const x = Math.round(body.x);
    const y = Math.round(body.y);
    const l = this.countDrawn(x - m, y, m, s);
    const r = this.countDrawn(x + s, y, m, s);
    const t = this.countDrawn(x, y - m, s, m);
    const b = this.countDrawn(x, y + s, s, m);
    const nx = l - r;
    const ny = t - b;
    if (nx === 0 && ny === 0) return null;
    return { x: nx, y: ny };
  }

  private stepBody(
    body: Body,
    dt: number,
    restitution: number,
    settle: number,
    passFloor = false,
    topWall?: number,
  ): StepResult {
    const dx = body.vx * dt;
    const dy = body.vy * dt;
    const blockedX = dx !== 0 && !this.isClear(body.x + dx, body.y);
    const blockedY =
      dy !== 0 &&
      (!this.isClear(body.x, body.y + dy, passFloor) || (topWall !== undefined && body.y + dy < topWall));
    if (!blockedX) body.x += dx;
    if (!blockedY) body.y += dy;

    let ink = false;
    let approach = 0;
    if (blockedY && this.inkAtRect(body.x, body.y + dy)) {
      ink = true;
      approach = Math.max(approach, Math.abs(body.vy));
    }
    if (blockedX && this.inkAtRect(body.x + dx, body.y)) {
      ink = true;
      approach = Math.max(approach, Math.abs(body.vx));
    }
    const inkBlockedX = blockedX && this.inkAtRect(body.x + dx, body.y);
    const inkBlockedY = blockedY && this.inkAtRect(body.x, body.y + dy);

    if (!blockedX && !blockedY) return { approach, ink };

    const nx0 = body.x + dx;
    const ny0 = body.y + dy;
    const s = this.blockSize;
    const cw = this.worldW;
    const ch = this.worldH;

    let nx = 0;
    let ny = 0;
    let wallX = false;
    let wallY = false;
    if (blockedX && nx0 < 0) {
      nx += 1;
      wallX = true;
    }
    if (blockedX && nx0 + s > cw) {
      nx -= 1;
      wallX = true;
    }
    if (blockedY && topWall !== undefined && ny0 < topWall) {
      ny += 1;
      wallY = true;
    }
    if (blockedY && ny0 < 0) {
      ny += 1;
      wallY = true;
    }
    if (blockedY && ny0 + s > ch && !passFloor) {
      ny -= 1;
      wallY = true;
    }

    const pn = this.pixelNormal(body);
    if (pn) {
      nx += pn.x;
      ny += pn.y;
    }

    if (nx === 0 && ny === 0) {
      if (blockedX) body.vx = -body.vx * restitution;
      if (blockedY) body.vy = -body.vy * restitution;
      return { approach, ink };
    }

    const len = Math.hypot(nx, ny);
    nx /= len;
    ny /= len;

    const vn = body.vx * nx + body.vy * ny;
    if (vn >= 0) return { approach, ink };

    approach = Math.max(approach, -vn);
    if (approach >= settle) {
      body.vx -= (1 + restitution) * vn * nx;
      body.vy -= (1 + restitution) * vn * ny;
      if ((wallX || wallY) && approach >= 60 && this.borderSoundTimer <= 0) {
        this.sfx.border(Math.min(approach, 800));
        this.borderSoundTimer = 0.12;
      }
      return { approach, ink };
    }

    body.vx -= vn * nx;
    body.vy -= vn * ny;

if (settle > 0) {
      if (!inkBlockedX && !inkBlockedY) {
        body.vx *= this.friction;
        body.vy *= this.friction;
        if (Math.hypot(body.vx, body.vy) < this.frictionStop) {
          body.vx = 0;
          body.vy = 0;
          return { approach, ink };
        }
      }

      let tx = ny;
      let ty = -nx;
      if (ty < 0) {
        tx = -tx;
        ty = -ty;
      }
      const g = (this.gravity * dt) * ty;
      body.vx += g * tx;
      body.vy += g * ty;

      const speed = Math.hypot(body.vx, body.vy);
      if (speed > this.maxFall) {
        body.vx *= this.maxFall / speed;
        body.vy *= this.maxFall / speed;
      }
    }
    return { approach, ink };
  }

  private resolveOverlap(body: Body): void {
    if (this.isClear(body.x, body.y)) return;

    const sx = Math.sign(body.vx);
    const sy = Math.sign(body.vy);
    const tries: ReadonlyArray<readonly [number, number]> = [
      [-sx, 0],
      [0, -sy],
      [-sx, -sy],
    ];
    for (let i = 1; i <= this.blockSize; i++) {
      for (const [ox, oy] of tries) {
        const px = body.x + ox * i;
        const py = body.y + oy * i;
        if (this.isClear(px, py)) {
          body.x = px;
          body.y = py;
          return;
        }
      }
    }
  }

  private updateBouncer(dt: number): void {
    this.tearTimer -= dt;
    if (this.tearTimer <= 0) {
      this.tearTimer = 3.5 + Math.random() * 2.5;
      this.particles.push({
        x: this.bouncer.x + this.blockSize * 0.62,
        y: this.bouncer.y + this.blockSize * 0.4,
        vx: 0,
        vy: 70,
        life: 1.4,
        maxLife: 1.4,
        size: 2.5,
        color: '#8ab8e8',
      });
    }
  }

  private updateDropper(d: Dropper, dt: number): void {
    d.vy = Math.min(d.vy + this.gravity * dt, this.maxFall);
    const impact = this.stepBody(d, dt, this.bounciness, this.settleSpeed);
    if (impact.approach >= this.settleSpeed && impact.ink) {
      d.bounceBonus += 5;
      if (this.bounceSoundTimer <= 0) {
        this.sfx.bounce(Math.min(impact.approach, 600));
        this.bounceSoundTimer = 0.1;
      }
    }
    this.resolveOverlap(d);
  }

  private checkDropperCollision(): void {
    const s = this.blockSize;
    const bouncers = [this.bouncer, ...this.extraBouncers];
    for (const b of bouncers) {
      for (const d of this.droppers) {
        if (!d.alive) continue;
        if (b.x < d.x + s && b.x + s > d.x && b.y < d.y + s && b.y + s > d.y) {
          const deadColor = d.gold ? '#ffd700' : d.color;
          this.explode(d, this.bloodDirection(b, d), deadColor);
          this.shake = Math.min(10, this.shake + 4);
          this.sfx.kill();
          d.alive = false;
          d.trailPts.length = 0;
          d.respawnTimer = d.producer ? this.producerRespawnTime(d.producer) * (0.5 + Math.random() * 0.5) : 0;
          this.awardMoney(d);
          if (this.dragged === d) {
            this.dragged = null;
          }
        }
      }
    }
  }

  private checkStuckDroppers(dt: number): void {
    const b = this.bouncer;
    for (const d of this.droppers) {
      if (!d.alive) continue;
      if (this.dragged === d) {
        d.stuckTimer = 0;
        continue;
      }
      if (Math.hypot(d.vx, d.vy) < 1) {
        d.stuckTimer += dt;
        if (d.stuckTimer >= 5) {
          this.explode(d, this.bloodDirection(b, d), d.color);
          this.shake = Math.min(10, this.shake + 4);
          this.sfx.kill();
          d.alive = false;
          d.trailPts.length = 0;
          d.respawnTimer = d.producer ? this.producerRespawnTime(d.producer) * (0.5 + Math.random() * 0.5) : 0;
          d.stuckTimer = 0;
        }
      } else {
        d.stuckTimer = 0;
      }
    }
  }

  private awardMoney(d: Dropper): void {
    let gain: number;
    if (d.gold) {
      gain = 100000;
    } else {
      gain = this.rewardPerDeath + d.bounceBonus;
      const double = this.upgrades.find((u) => u.id === 'double')?.level ?? 0;
      if (Math.random() < double * 0.15) {
        gain *= 2;
      }
    }
    this.money += gain;
    d.bounceBonus = 0;
    this.markSaveDirty();
  }

  private upgradeCost(i: number): number {
    const up = this.upgrades[i];
    return Math.round(up.baseCost * Math.pow(up.growth, up.level));
  }

  private upgradeGeometry(): { x: number; y: number; w: number; rowH: number; gap: number; pad: number; header: number } {
    return { x: this.canvas.width - 242, y: 46, w: 242, rowH: 52, gap: 8, pad: 10, header: 30 };
  }

  private upgradeRowsView(): number {
    const g = this.upgradeGeometry();
    const n = this.upgrades.length;
    const contentH = n * g.rowH + (n - 1) * g.gap;
    const maxH = Math.max(g.rowH, this.canvas.height - (g.y + g.header + g.pad + 12));
    return Math.min(contentH, maxH);
  }

  private upgradeMaxScroll(): number {
    const g = this.upgradeGeometry();
    const n = this.upgrades.length;
    const contentH = n * g.rowH + (n - 1) * g.gap;
    return Math.max(0, contentH - this.upgradeRowsView());
  }

  private clampUpgradeScroll(): void {
    this.upgradeScroll = Math.max(0, Math.min(this.upgradeScroll, this.upgradeMaxScroll()));
  }

  private pointInUpgradePanel(px: number, py: number): boolean {
    const g = this.upgradeGeometry();
    const h = g.header + this.upgradeRowsView() + g.pad;
    return px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + h;
  }

  private upgradesButton(): { x: number; y: number; w: number; h: number } {
    return { x: this.canvas.width - 108, y: 12, w: 96, h: 26 };
  }

  private hitUpgrade(px: number, py: number): number {
    if (!this.upgradesOpen) return -1;
    const g = this.upgradeGeometry();
    const rowsTop = g.y + g.header;
    const viewH = this.upgradeRowsView();
    for (let i = 0; i < this.upgrades.length; i++) {
      const ry = rowsTop + i * (g.rowH + g.gap) - this.upgradeScroll;
      if (ry + g.rowH < rowsTop || ry >= rowsTop + viewH) continue;
      if (px >= g.x + g.pad && px <= g.x + g.w - g.pad && py >= ry && py <= ry + g.rowH) {
        return i;
      }
    }
    return -1;
  }

  private hitResetButton(px: number, py: number): boolean {
    if (!this.settingsOpen) return false;
    const p = this.settingsPanel();
    const g = this.settingsButtonsGeom();
    return px >= p.x + p.pad && px <= p.x + p.pad + g.btnW && py >= g.resetBtnY && py <= g.resetBtnY + g.btnH;
  }

  private readonly settingsButton = { x: 12, y: 12, w: 96, h: 26 };

  private hitSettingsButton(px: number, py: number): boolean {
    const b = this.settingsButton;
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  private hitUpgradesButton(px: number, py: number): boolean {
    const b = this.upgradesButton();
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  private settingsPanel(): { x: number; y: number; w: number; rowH: number; gap: number; pad: number } {
    return { x: 12, y: 46, w: 264, rowH: 34, gap: 6, pad: 8 };
  }

  private settingsButtonsGeom(): { btnH: number; btnW: number; btnY: number; resetBtnY: number } {
    const p = this.settingsPanel();
    const rows = 3;
    const ctlTop = p.y + p.pad + rows * p.rowH + (rows - 1) * p.gap + 12;
    const btnH = 28;
    const btnW = p.w - p.pad * 2;
    return { btnH, btnW, btnY: ctlTop + 6, resetBtnY: ctlTop + 6 + btnH + 8 };
  }

  private hitSettingsControl(px: number, py: number): { row: number; btn: 'minus' | 'plus' } | null {
    if (!this.settingsOpen) return null;
    const p = this.settingsPanel();
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      const ry = p.y + p.pad + i * (p.rowH + p.gap);
      if (py < ry || py >= ry + p.rowH) continue;
      const btnW = 24;
      const btnH = 24;
      const btnY = ry + (p.rowH - btnH) / 2;
      const plusX = p.x + p.w - p.pad - btnW;
      const minusX = plusX - 34;
      if (px >= plusX && px <= plusX + btnW && py >= btnY && py <= btnY + btnH) {
        return { row: i, btn: 'plus' };
      }
      if (px >= minusX && px <= minusX + btnW && py >= btnY && py <= btnY + btnH) {
        return { row: i, btn: 'minus' };
      }
      return null;
    }
    return null;
  }

  private applySettingsControl(c: { row: number; btn: 'minus' | 'plus' }): void {
    const delta = c.btn === 'plus' ? 1 : -1;
    if (c.row === 0) {
      this.bloodDuration = Math.min(30, Math.max(5, this.bloodDuration + delta));
    } else if (c.row === 1) {
      const step = 0.25;
      this.bloodAmount = Math.round(Math.min(3, Math.max(0.5, this.bloodAmount + step * delta)) * 100) / 100;
    } else {
      const step = 25;
      this.sfx.setVolume(Math.min(500, Math.max(0, this.sfx.volume + step * delta)));
      this.sfx.bounce(5);
    }
    this.markSaveDirty();
    if (!this.secretAvailable()) {
      this.secretOpen = false;
      this.freePlace = false;
    }
  }

  private hitClearBloodButton(px: number, py: number): boolean {
    if (!this.settingsOpen) return false;
    const p = this.settingsPanel();
    const g = this.settingsButtonsGeom();
    return px >= p.x + p.pad && px <= p.x + p.pad + g.btnW && py >= g.btnY && py <= g.btnY + g.btnH;
  }

  private clearBlood(): void {
    this.bloodCtx.clearRect(0, 0, this.bloodLayer.width, this.bloodLayer.height);
    this.splats.length = 0;
    this.worldStains.length = 0;
    this.markSaveDirty();
  }

  private resetAll(): void {
    this.money = 0;
    this.rewardPerDeath = 5;
    for (const up of this.upgrades) {
      up.level = 0;
    }
    this.layerCtx.clearRect(0, 0, this.layer.width, this.layer.height);
    this.solidCtx.clearRect(0, 0, this.solidLayer.width, this.solidLayer.height);
    this.bloodCtx.clearRect(0, 0, this.bloodLayer.width, this.bloodLayer.height);
    this.splats.length = 0;
    this.worldStains.length = 0;
    this.particles.length = 0;
    this.rings.length = 0;
    this.shake = 0;
    this.droppers.length = 0;
    this.extraBouncers.length = 0;
    this.fans.length = 0;
    this.producers.length = 0;
    this.fanDrag = null;
    this.draggedFan = null;
    this.producerDrag = null;
    this.draggedProducer = null;
    this.selectedProducer = null;
    this.selectedFan = null;
    this.secretOpen = false;
    this.freePlace = false;
    this.applyWorldSize();
    this.createProducer(Math.round(this.worldW / 2 - this.producerW / 2), 8);
    this.centerCamera();
    try {
      localStorage.removeItem(this.saveKey);
    } catch {
      // storage unavailable
    }
    this.saveDirty = false;
    this.inkDirty = false;
  }

  private tryBuyUpgrade(i: number): void {
    const up = this.upgrades[i];
    if (up.level >= up.maxLevel || this.money < this.upgradeCost(i)) {
      this.sfx.deny();
      return;
    }
    this.money -= this.upgradeCost(i);
    up.level++;
    this.sfx.buy();
    this.markSaveDirty();
    if (up.id === 'cash') {
      this.rewardPerDeath = 5 + 5 * up.level;
    } else if (up.id === 'map') {
      this.applyWorldSize();
    }
  }

  private renderSettings(): void {
    const { ctx } = this;
    const b = this.settingsButton;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Settings', b.x + b.w / 2, b.y + b.h / 2 + 4.5);
    if (!this.settingsOpen) return;
    const p = this.settingsPanel();
    const rows: ReadonlyArray<readonly [string, string]> = [
      ['Blood Duration', `${this.bloodDuration}s`],
      ['Blood Amount', `${Math.round(this.bloodAmount * 100)}%`],
      ['Sound Volume', `${this.sfx.volume}%`],
    ];
    const controls: ReadonlyArray<string> = [
      'left-drag: draw / place objects',
      'fan: drag to aim the arrow',
      'producer: drag to place, click to upgrade',
      'right-drag: move blocks/fans/producers / pan',
      'scroll: zoom',
      `E: eraser (${this.erasing ? 'ON' : 'off'}, fans/producers too)`,
      'R: clear ink',
      `M: sound (${this.sfx.muted ? 'off' : 'on'})`,
    ];
    const g = this.settingsButtonsGeom();
    const btnH = g.btnH;
    const btnY = g.btnY;
    const btnW = g.btnW;
    const resetBtnY = g.resetBtnY;
    const ctlHeaderH = 18;
    const ctlLineH = 17;
    const ctlTop2 = resetBtnY + btnH + 10;
    const panelH = ctlTop2 + ctlHeaderH + controls.length * ctlLineH + p.pad;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.fillRect(p.x, p.y, p.w, panelH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.strokeRect(p.x, p.y, p.w, panelH);
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < rows.length; i++) {
      const ry = p.y + p.pad + i * (p.rowH + p.gap);
      const btnW = 24;
      const btnH = 24;
      const btnY = ry + (p.rowH - btnH) / 2;
      const plusX = p.x + p.w - p.pad - btnW;
      const minusX = plusX - 34;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(rows[i][0], p.x + p.pad, ry + p.rowH / 2 + 4);
      ctx.textAlign = 'right';
      ctx.fillText(rows[i][1], minusX - 6, ry + p.rowH / 2 + 4);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(minusX, btnY, btnW, btnH);
      ctx.fillRect(plusX, btnY, btnW, btnH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(minusX, btnY, btnW, btnH);
      ctx.strokeRect(plusX, btnY, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('−', minusX + btnW / 2, ry + p.rowH / 2 + 4);
      ctx.fillText('+', plusX + btnW / 2, ry + p.rowH / 2 + 4);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = 'rgba(140, 36, 36, 0.9)';
    ctx.fillRect(p.x + p.pad, btnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(p.x + p.pad, btnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Clear Blood', p.x + p.w / 2, btnY + btnH / 2 + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(140, 36, 36, 0.9)';
    ctx.fillRect(p.x + p.pad, resetBtnY, btnW, btnH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(p.x + p.pad, resetBtnY, btnW, btnH);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Reset All Progress', p.x + p.w / 2, resetBtnY + btnH / 2 + 4);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(p.x + p.pad, ctlTop2);
    ctx.lineTo(p.x + p.w - p.pad, ctlTop2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText('CONTROLS', p.x + p.pad, ctlTop2 + ctlHeaderH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < controls.length; i++) {
      ctx.fillText(controls[i], p.x + p.pad, ctlTop2 + ctlHeaderH + 2 + (i + 1) * ctlLineH);
    }
  }

  private renderUpgrades(): void {
    const { ctx } = this;
    const b = this.upgradesButton();
    ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Upgrades', b.x + b.w / 2, b.y + b.h / 2 + 4.5);
    if (!this.upgradesOpen) return;
    const g = this.upgradeGeometry();
    const n = this.upgrades.length;
    const rowsTop = g.y + g.header;
    const viewH = this.upgradeRowsView();
    const contentH = n * g.rowH + (n - 1) * g.gap;
    const panelH = g.header + viewH + g.pad;

    ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.fillRect(g.x, g.y, g.w, panelH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(g.x, g.y, g.w, panelH);

    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('UPGRADES', g.x + g.pad, g.y + g.pad + 14);

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x + 1, rowsTop, g.w - 2, viewH);
    ctx.clip();
    for (let i = 0; i < n; i++) {
      const ry = rowsTop + i * (g.rowH + g.gap) - this.upgradeScroll;
      if (ry + g.rowH < rowsTop || ry >= rowsTop + viewH) continue;
      const up = this.upgrades[i];
      const maxed = up.level >= up.maxLevel || (up.id === 'map' && this.mapCapped());
      const cost = this.upgradeCost(i);
      const afford = this.money >= cost && !maxed;

      ctx.fillStyle = afford ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(g.x + g.pad, ry, g.w - g.pad * 2, g.rowH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${up.name}  Lv ${up.level}`, g.x + g.pad + 8, ry + 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(maxed ? 'MAX' : `$${cost}`, g.x + g.pad + 8, ry + 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(up.desc, g.x + g.pad + 8, ry + 47);
    }
    ctx.restore();

    if (contentH > viewH) {
      const trackX = g.x + g.w - 7;
      const trackTop = rowsTop + 3;
      const trackH = viewH - 6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(trackX, trackTop, 3, trackH);
      const thumbH = Math.max(20, Math.round((trackH * viewH) / contentH));
      const thumbY = trackTop + Math.round(((trackH - thumbH) * this.upgradeScroll) / (contentH - viewH));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(trackX, thumbY, 3, thumbH);
    }
  }

  private bloodDirection(hitter: Body, victim: Body): { x: number; y: number } {
    const dx = victim.x - hitter.x;
    const dy = victim.y - hitter.y;
    const sep = Math.hypot(dx, dy) || 1;
    let ux = dx / sep;
    let uy = dy / sep;

    const vs = Math.hypot(victim.vx, victim.vy);
    if (vs > 60) {
      ux = (ux + victim.vx / vs) * 0.5;
      uy = (uy + victim.vy / vs) * 0.5;
    }
    const len = Math.hypot(ux, uy);
    if (len < 0.5) {
      const a = Math.random() * Math.PI * 2;
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    return { x: ux / len, y: uy / len };
  }

  private addWorldStain(x: number, y: number, size: number, color: string, alpha: number): void {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      if (this.worldStains.length >= 500) {
        this.worldStains.shift();
      }
      this.worldStains.push({
        x: x + (Math.random() - 0.5) * size * 1.5,
        y: y + (Math.random() - 0.5) * size,
        size: size * (0.4 + Math.random() * 0.8),
        color,
        alpha: alpha * (0.6 + Math.random() * 0.5),
        born: this.time,
      });
    }
  }

  private shadeColor(hex: string, factor: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r0 = (n >> 16) & 255;
    const g0 = (n >> 8) & 255;
    const b0 = n & 255;
    let r: number;
    let g: number;
    let b: number;
    if (factor > 1) {
      r = Math.round(r0 + (255 - r0) * (factor - 1));
      g = Math.round(g0 + (255 - g0) * (factor - 1));
      b = Math.round(b0 + (255 - b0) * (factor - 1));
    } else {
      r = Math.round(r0 * factor);
      g = Math.round(g0 * factor);
      b = Math.round(b0 * factor);
    }
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

private hslToHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const to255 = (v: number): number => Math.round((v + m) * 255);
    return `#${((to255(r) << 16) | (to255(g) << 8) | to255(b)).toString(16).padStart(6, '0')}`;
  }

  private nextDropperColor(): string {
    let color: string;
    do {
      color = this.hslToHex(Math.random() * 360, 0.65 + Math.random() * 0.3, 0.45 + Math.random() * 0.2);
    } while (this.droppers.some((d) => d.color === color));
    return color;
  }

  private goldChance(): number {
    return 0.01;
  }

  private rollGold(): boolean {
    return Math.random() < this.goldChance();
  }

  private spawnGoldBurst(x: number, y: number): void {
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      const life = 0.5 + Math.random() * 0.7;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 90,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#ffd700' : '#fff2a8',
      });
    }
  }

  private emitGoldParticles(d: Dropper, dt: number): void {
    const cx = d.x + this.blockSize / 2;
    const cy = d.y + this.blockSize / 2;
    const phase = (d.x * 7 + d.y * 13) % 1;
    const interval = 0.09;
    const prev = Math.floor((this.time - dt + phase) / interval);
    const now = Math.floor((this.time + phase) / interval);
    for (let i = 0; i < now - prev; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 60;
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life,
        maxLife: life,
        size: 1.5 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#ffd700' : '#fff2a8',
      });
    }
  }

  private emitTrailParticles(d: Dropper, dt: number): void {
    const lv = d.producer ? d.producer.trailLv : 0;
    if (lv <= 0) return;
    const cx = d.x + this.blockSize / 2;
    const cy = d.y + this.blockSize / 2;
    const interval = Math.max(0.02, 0.08 / lv);
    const phase = (d.x * 11 + d.y * 17) % 1;
    const prev = Math.floor((this.time - dt + phase) / interval);
    const now = Math.floor((this.time + phase) / interval);
    for (let i = 0; i < now - prev; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 8,
        y: cy + (Math.random() - 0.5) * 8,
        vx: -d.vx * 0.2 + (Math.random() - 0.5) * 20,
        vy: -d.vy * 0.2 + (Math.random() - 0.5) * 20,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 2 + Math.random() * (1 + Math.min(lv, 3)),
        color: d.gold ? '#ffd700' : this.shadeColor(d.color, 0.8),
      });
    }
  }

  private updateTrail(d: Dropper): void {
    const lv = d.producer ? d.producer.trailLv : 0;
    if (lv < 2) return;
    const cx = d.x + this.blockSize / 2;
    const cy = d.y + this.blockSize / 2;
    const last = d.trailPts[d.trailPts.length - 1];
    if (last && Math.hypot(cx - last.x, cy - last.y) < 4) return;
    d.trailPts.push({ x: cx, y: cy });
  }

  private renderTrail(d: Dropper): void {
    const pts = d.trailPts;
    if (pts.length < 2) return;
    const { ctx } = this;
    const lv = d.producer ? d.producer.trailLv : 0;
    const color = d.gold ? '#ffd700' : d.color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1, 2 + lv * 0.4);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private createDropper(producer: Producer, spawn?: DropperSave): Dropper {
    const spawnX = Math.round(producer.x + (this.producerW - this.blockSize) / 2);
    const spawnY = Math.round(producer.y + this.producerH);
    const v = spawn ? { vx: spawn.spawnVx, vy: spawn.spawnVy } : { vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 60 };
    const x = spawn && typeof spawn.x === 'number' ? Math.min(Math.max(spawn.x, 0), this.worldW - this.blockSize) : spawnX;
    const y = spawn && typeof spawn.y === 'number' ? Math.min(Math.max(spawn.y, 0), this.worldH - this.blockSize) : spawnY;
    const gold = spawn?.gold ?? this.rollGold();
    if (gold) {
      this.spawnGoldBurst(x + this.blockSize / 2, y + this.blockSize / 2);
    }
    return {
      x,
      y,
      vx: v.vx,
      vy: v.vy,
      alive: true,
      respawnTimer: 0,
      spawnVx: v.vx,
      spawnVy: v.vy,
      bounceBonus: 0,
      stuckTimer: 0,
      color: spawn?.color ?? this.nextDropperColor(),
      gold,
      producer,
      trailPts: [],
    };
  }

  private createProducer(x: number, y: number, speedLv = 0, countLv = 0, trailLv = 0): Producer {
    const p: Producer = { x, y, speedLv, countLv, trailLv };
    this.producers.push(p);
    const want = 1 + countLv;
    for (let i = 0; i < want; i++) {
      this.droppers.push(this.createDropper(p));
    }
    return p;
  }

  private producerRespawnTime(p: Producer): number {
    return 1.5 * Math.pow(0.8, p.speedLv);
  }

  private createExtraBouncer(): Body {
    const s = this.blockSize;
    return {
      x: Math.round(Math.random() * Math.max(0, this.worldW - s)),
      y: Math.round(this.topMatHeight + Math.random() * Math.max(0, this.worldH - this.topMatHeight - s)),
      vx: 0,
      vy: 0,
    };
  }

  private explode(body: Body, dir: { x: number; y: number }, deadColor: string): void {
    const cx = body.x + this.blockSize / 2;
    const cy = body.y + this.blockSize / 2;
    const colors = [
      deadColor,
      this.shadeColor(deadColor, 1.25),
      this.shadeColor(deadColor, 0.8),
      this.shadeColor(deadColor, 0.65),
    ];
    const speed = Math.hypot(body.vx, body.vy);
    const reach = 20 + Math.min(speed * 0.05, 50);
    this.drawSplatter(cx, cy, deadColor, dir.x, dir.y, reach);

    if (this.rings.length > 8) {
      this.rings.shift();
    }
    this.rings.push({
      x: cx,
      y: cy,
      maxR: 46 + Math.min(speed * 0.09, 70) + this.bloodAmount * 12,
      born: this.time,
      life: 0.4,
      color: this.shadeColor(deadColor, 1.4),
      width: 4 + Math.random() * 3,
    });

    for (let i = 0; i < 44; i++) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = 150 + Math.random() * 420 + speed * 0.25;
      const life = 0.5 + Math.random() * 0.9;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 14,
        y: cy + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * magnitude + body.vx * 0.1,
        vy: Math.sin(angle) * magnitude - 60 + body.vy * 0.1,
        life,
        maxLife: life,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const sparkCount = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = 320 + Math.random() * 480 + speed * 0.2;
      const life = 0.25 + Math.random() * 0.35;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude - 40,
        life,
        maxLife: life,
        size: 1 + Math.random() * 2,
        color: this.shadeColor(deadColor, 1.5),
      });
    }

    this.particles.push({
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      life: 0.12,
      maxLife: 0.12,
      size: 22 + Math.random() * 8,
      color: this.shadeColor(deadColor, 1.6),
    });

    if (this.particles.length > 500) {
      this.particles.splice(0, this.particles.length - 500);
    }
  }

  private drawSplatter(cx: number, cy: number, color: string, dirX: number, dirY: number, reach: number): void {
    const amount = this.bloodAmount;
    reach *= amount;
    const colors = [
      color,
      this.shadeColor(color, 0.85),
      this.shadeColor(color, 1.25),
      this.shadeColor(color, 0.7),
    ];
    const px = -dirY;
    const py = dirX;

    const blobs = Math.round((16 + Math.floor(Math.random() * 10)) * amount);
    for (let i = 0; i < blobs; i++) {
      const forward = reach * (Math.random() * 1.3 - 0.25);
      const side = (Math.random() - 0.5) * 24;
      const x = cx + dirX * forward + px * side;
      const y = cy + dirY * forward + py * side;
      const size = 2 + Math.random() * 7;
      const alpha = 0.45 + Math.random() * 0.4;
      const c = colors[Math.floor(Math.random() * colors.length)];
      if (Math.random() < 0.3) {
        this.splats.push({
          kind: 'drip',
          born: this.time,
          x,
          y,
          width: size,
          color: c,
          alpha,
          speed: 18 + Math.random() * 22,
          vy: 0,
          contact: false,
          startY: y,
        });
      } else {
        this.splats.push({
          kind: 'blob',
          born: this.time,
          x,
          y,
          size,
          color: c,
          alpha,
        });
      }
    }

    const baseAngle = Math.atan2(dirY, dirX);
    const streaks = Math.round((5 + Math.floor(Math.random() * 5)) * amount);
    for (let i = 0; i < streaks; i++) {
      const length = 18 + Math.random() * 26;
      const width = 3 + Math.random() * 4;
      const angle = baseAngle + (Math.random() - 0.5) * 1.6;
      const start = reach * (0.25 + Math.random() * 0.9) * (Math.random() < 0.8 ? 1 : -1);
      const sx = cx + Math.cos(angle) * start;
      const sy = cy + Math.sin(angle) * start;
      const c = colors[Math.floor(Math.random() * colors.length)];
      const alpha = 0.5 + Math.random() * 0.35;
      this.splats.push({
        kind: 'streak',
        born: this.time,
        x: sx,
        y: sy,
        length,
        width,
        angle,
        color: c,
        alpha,
      });
    }
  }

  private hasSupport(x: number, y: number, w: number): boolean {
    const ix = Math.round(x);
    const iw = Math.max(1, Math.round(w));
    const iy = Math.round(y) + Math.round(w);
    if (iy >= this.worldH - 1) return false;
    return this.countDrawn(ix - Math.floor(iw / 2), iy, iw + 1, 2) > 0;
  }

  private updateSplats(dt: number): void {
    for (const s of this.splats) {
      if (s.kind !== 'drip') continue;
      const w = s.width;
      if (s.contact) {
        if (s.y + w >= this.worldH - 1) continue;
        if (this.hasSupport(s.x, s.y, w)) {
          s.y += s.speed * dt;
        } else {
          s.contact = false;
        }
        if (Math.random() < dt * 5) {
          this.addWorldStain(s.x - w / 2, s.y + w, w * (0.6 + Math.random() * 0.6), s.color, 0.45 + Math.random() * 0.25);
        }
      } else {
        s.vy = Math.min(s.vy + this.gravity * 0.6 * dt, 800);
        s.y += s.vy * dt;
        if (s.y + w >= this.worldH - 1 || this.hasSupport(s.x, s.y, w)) {
          s.contact = true;
          s.startY = s.y;
          s.vy = 0;
          this.addWorldStain(s.x - w / 2, s.y + w, w, s.color, 0.55);
        }
      }
    }
  }

  private renderBouncerBody(b: Body, isMain: boolean): void {
    const { ctx } = this;
    const s = this.blockSize;
    const cx = b.x + s / 2;
    const cy = b.y + s / 2;
    const r = s / 2;
    const base = isMain ? '#4a90e2' : '#63b3ed';
    const pulse = (Math.sin(this.time * 5 + (isMain ? 0 : 1.7)) + 1) / 2;
    ctx.strokeStyle = base;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
    grad.addColorStop(0, '#b8dcff');
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, '#123f6b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderSplats(): void {
    const { ctx } = this;
    const life = this.splatLifetime();
    for (const s of this.splats) {
      const age = this.time - s.born;
      if (age < 0 || age >= life) continue;
      const fade = 1 - age / life;
      ctx.globalAlpha = s.alpha * fade;
      ctx.fillStyle = s.color;
      if (s.kind === 'blob') {
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      } else if (s.kind === 'streak') {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.fillRect(-s.length / 2, -s.width / 2, s.length, s.width);
        ctx.restore();
      } else if (s.contact) {
        ctx.fillRect(s.x - s.width / 2, s.startY, s.width, s.y - s.startY + s.width);
      } else {
        ctx.fillRect(s.x - s.width / 2, s.y, s.width, s.width);
      }
    }
    ctx.globalAlpha = 1;
  }

  private respawnDropper(dt: number): void {
    for (let i = this.droppers.length - 1; i >= 0; i--) {
      const d = this.droppers[i];
      if (d.alive) continue;
      d.respawnTimer -= dt;
      if (d.respawnTimer > 0) continue;
      if (!d.producer) {
        this.droppers.splice(i, 1);
        continue;
      }
      d.x = Math.round(d.producer.x + (this.producerW - this.blockSize) / 2);
      d.y = Math.round(d.producer.y + this.producerH);
      d.vx = d.spawnVx;
      d.vy = d.spawnVy;
      d.alive = true;
      d.bounceBonus = 0;
      d.stuckTimer = 0;
      d.trailPts.length = 0;
      d.gold = this.rollGold();
      if (d.gold) {
        this.spawnGoldBurst(d.x + this.blockSize / 2, d.y + this.blockSize / 2);
        this.rings.push({
          x: d.x + this.blockSize / 2,
          y: d.y + this.blockSize / 2,
          maxR: 44,
          born: this.time,
          life: 0.6,
          color: '#ffd700',
          width: 4,
        });
      }
      this.sfx.respawn();
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += this.gravity * 0.7 * dt;
      p.vx *= Math.pow(0.97, dt * 60);
      p.vy *= Math.pow(0.985, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const r = p.size / 2;
      if (p.vy > 0 && (p.y + r >= this.worldH || this.inkAt(p.x, p.y, r))) {
        let guard = 0;
        while (guard < 8 && this.inkAt(p.x, p.y, r) && p.y < this.worldH) {
          p.y -= 1;
          guard++;
        }
        p.vy = -p.vy * 0.5;
        if (Math.abs(p.vy) < 60) p.vy = 0;
        this.addWorldStain(p.x - p.size / 2, p.y, p.size * (0.7 + Math.random() * 0.5), p.color, 0.5 + Math.random() * 0.3);
      }
      if (p.y + r >= this.worldH || this.inkAt(p.x, p.y, r)) {
        p.vx *= 0.92;
      }

      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private inkAt(x: number, y: number, rad: number): boolean {
    const ix = Math.round(x - rad);
    const iy = Math.round(y - rad);
    const w = Math.max(1, Math.round(rad * 2));
    return this.countDrawn(ix, iy, w, w) > 0;
  }

  private inkAtRect(x: number, y: number): boolean {
    return this.countDrawn(x, y, this.blockSize, this.blockSize) > 0;
  }

  private splatLifetime(): number {
    return this.bloodDuration;
  }

  private objectsButton(): { x: number; y: number; w: number; h: number } {
    return { x: this.canvas.width / 2 - 80, y: 12, w: 160, h: 26 };
  }

  private objectsPanelGeom(): { x: number; y: number; w: number; rowH: number; gap: number; pad: number } {
    return { x: this.canvas.width / 2 - 105, y: 46, w: 210, rowH: 26, gap: 6, pad: 8 };
  }

  private hitObjectsButton(px: number, py: number): boolean {
    const b = this.objectsButton();
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  private hitObjectRow(px: number, py: number): number {
    if (!this.objectsOpen) return -1;
    const p = this.objectsPanelGeom();
    for (let i = 0; i < this.objectTools.length; i++) {
      const ry = p.y + p.pad + i * (p.rowH + p.gap);
      if (px >= p.x + p.pad && px <= p.x + p.w - p.pad && py >= ry && py <= ry + p.rowH) {
        return i;
      }
    }
    return -1;
  }

  private renderObjectsMenu(): void {
    const { ctx } = this;
    const b = this.objectsButton();
    ctx.fillStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const modeName = this.objectTools.find((t) => t.id === this.objectMode)?.name ?? '';
    ctx.fillText(modeName === 'Ink Pen' ? 'Objects' : `Objects: ${modeName}`, b.x + b.w / 2, b.y + b.h / 2 + 4.5);
    if (!this.objectsOpen) return;
    const p = this.objectsPanelGeom();
    const n = this.objectTools.length;
    const panelH = p.pad + n * p.rowH + (n - 1) * p.gap + p.pad;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.fillRect(p.x, p.y, p.w, panelH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(p.x, p.y, p.w, panelH);
    for (let i = 0; i < n; i++) {
      const tool = this.objectTools[i];
      const ry = p.y + p.pad + i * (p.rowH + p.gap);
      const selected = tool.id === this.objectMode;
      ctx.fillStyle = selected ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(p.x + p.pad, ry, p.w - p.pad * 2, p.rowH);
      ctx.fillStyle = selected ? '#ffe08a' : '#ffffff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(selected ? '> ' : '', p.x + p.pad + 6, ry + p.rowH / 2 + 4.5);
      ctx.fillText(tool.name, p.x + p.pad + 22, ry + p.rowH / 2 + 4.5);
      if (tool.id === 'fan' || tool.id === 'producer' || tool.id === 'destroyer') {
        ctx.textAlign = 'right';
        const cost =
          tool.id === 'fan' ? this.fanCost : tool.id === 'producer' ? this.producerCost : this.extraBouncerCost;
        ctx.fillStyle = this.money >= cost ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 80, 80, 0.95)';
        ctx.fillText(`$${cost}`, p.x + p.w - p.pad - 6, ry + p.rowH / 2 + 4.5);
      }
    }
  }

  private secretAvailable(): boolean {
    return this.bloodDuration === 17 && this.bloodAmount === 2.5 && this.sfx.volume === 175;
  }

  private secretObjects(): ReadonlyArray<{ id: ObjectTool; name: string }> {
    return this.objectTools;
  }

  private secretButton(): { x: number; y: number; w: number; h: number } {
    return { x: this.canvas.width - 72, y: Math.round(this.canvas.height / 2 - 13), w: 60, h: 26 };
  }

  private secretPanelGeom(): { x: number; y: number; w: number; rowH: number; gap: number; pad: number } {
    const b = this.secretButton();
    return { x: b.x - 118, y: b.y + b.h + 4, w: 110, rowH: 24, gap: 4, pad: 6 };
  }

  private hitSecretButton(px: number, py: number): boolean {
    if (!this.secretAvailable()) return false;
    const b = this.secretButton();
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  private hitSecretRow(px: number, py: number): number {
    if (!this.secretOpen) return -1;
    const g = this.secretPanelGeom();
    const list = this.secretObjects();
    for (let i = 0; i < list.length; i++) {
      const ry = g.y + g.pad + i * (g.rowH + g.gap);
      if (px >= g.x + g.pad && px <= g.x + g.w - g.pad && py >= ry && py <= ry + g.rowH) {
        return i;
      }
    }
    return -1;
  }

  private selectSecretObject(i: number): void {
    const list = this.secretObjects();
    const obj = list[i];
    if (!obj) return;
    this.objectMode = obj.id;
    this.freePlace = true;
    this.secretOpen = false;
    this.sfx.buy();
  }

  private renderSecretMenu(): void {
    if (!this.secretAvailable()) return;
    const { ctx } = this;
    const b = this.secretButton();
    ctx.fillStyle = 'rgba(90, 20, 120, 0.9)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SECRET', b.x + b.w / 2, b.y + b.h / 2 + 4);
    if (!this.secretOpen) return;
    const g = this.secretPanelGeom();
    const list = this.secretObjects();
    const n = list.length;
    const panelH = g.pad + n * g.rowH + (n - 1) * g.gap + g.pad;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.92)';
    ctx.fillRect(g.x, g.y, g.w, panelH);
    ctx.strokeStyle = 'rgba(200, 120, 255, 0.5)';
    ctx.strokeRect(g.x, g.y, g.w, panelH);
    ctx.textAlign = 'left';
    for (let i = 0; i < n; i++) {
      const ry = g.y + g.pad + i * (g.rowH + g.gap);
      const obj = list[i];
      ctx.fillStyle =
        this.objectMode === obj.id ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(g.x + g.pad, ry, g.w - g.pad * 2, g.rowH);
      ctx.fillStyle = '#ffe08a';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(obj.name, g.x + g.pad + 8, ry + g.rowH / 2 + 4);
    }
    ctx.textAlign = 'left';
  }

  private clampFanPos(x: number, y: number): { x: number; y: number } {
    const s = this.fanSize;
    return {
      x: Math.min(Math.max(Math.round(x), 0), Math.max(0, this.worldW - s)),
      y: Math.min(Math.max(Math.round(y), 0), Math.max(0, this.worldH - s)),
    };
  }

  private hitFanIndex(x: number, y: number): number {
    const s = this.fanSize;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      if (x < f.x + s && x + s > f.x && y < f.y + s && y + s > f.y) {
        return i;
      }
    }
    return -1;
  }

  private hitFanPoint(px: number, py: number): number {
    const s = this.fanSize;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      if (px >= f.x && px < f.x + s && py >= f.y && py < f.y + s) {
        return i;
      }
    }
    return -1;
  }

  private rotateFan(f: Fan, dir: number): void {
    const step = (Math.PI / 12) * dir;
    const cos = Math.cos(step);
    const sin = Math.sin(step);
    const nx = f.dirX * cos - f.dirY * sin;
    const ny = f.dirX * sin + f.dirY * cos;
    const len = Math.hypot(nx, ny) || 1;
    f.dirX = nx / len;
    f.dirY = ny / len;
    this.markSaveDirty();
  }

  private placeFan(sx: number, sy: number): boolean {
    if (!this.freePlace && this.money < this.fanCost) {
      this.sfx.deny();
      return false;
    }
    const s = this.fanSize;
    const pos = this.clampFanPos(sx - s / 2, sy - s / 2);
    if (this.hitFanIndex(pos.x, pos.y) >= 0) {
      this.sfx.deny();
      return false;
    }
    const cx = pos.x + s / 2;
    const cy = pos.y + s / 2;
    const mx = this.mouseX / this.zoom + this.camX;
    const my = this.mouseY / this.zoom + this.camY;
    let dx = mx - cx;
    let dy = my - cy;
    const len = Math.hypot(dx, dy);
    if (len < 10) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    this.fans.push({ x: pos.x, y: pos.y, dirX: dx, dirY: dy, powerLv: 0, reachLv: 0 });
    if (!this.freePlace) {
      this.money -= this.fanCost;
    }
    this.sfx.buy();
    this.markSaveDirty();
    return true;
  }

  private fanEraserRadius(): number {
    return (this.eraserWidth * this.deviceScale) / 2;
  }

  private removeFansNear(x: number, y: number): void {
    const s = this.fanSize;
    const r = this.fanEraserRadius();
    let removed = false;
    for (let i = this.fans.length - 1; i >= 0; i--) {
      const f = this.fans[i];
      if (x >= f.x - r && x <= f.x + s + r && y >= f.y - r && y <= f.y + s + r) {
        if (this.selectedFan === f) {
          this.selectedFan = null;
        }
        if (this.draggedFan === f) {
          this.draggedFan = null;
        }
        this.fans.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      this.markSaveDirty();
    }
  }

  private removeFansAlong(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.fanEraserRadius();
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, r)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.removeFansNear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  private clampExtraBouncerPos(x: number, y: number): { x: number; y: number } {
    const s = this.blockSize;
    return {
      x: Math.min(Math.max(Math.round(x), 0), Math.max(0, this.worldW - s)),
      y: Math.min(Math.max(Math.round(y), this.topMatHeight), Math.max(0, this.worldH - s)),
    };
  }

  private placeExtraBouncer(sx: number, sy: number): boolean {
    if (!this.freePlace && this.money < this.extraBouncerCost) {
      this.sfx.deny();
      return false;
    }
    const s = this.blockSize;
    const pos = this.clampExtraBouncerPos(sx - s / 2, sy - s / 2);
    const b = { x: pos.x, y: pos.y, vx: 0, vy: 0 };
    const overlap =
      (b.x < this.bouncer.x + s && b.x + s > this.bouncer.x && b.y < this.bouncer.y + s && b.y + s > this.bouncer.y) ||
      this.extraBouncers.some((e) => b.x < e.x + s && b.x + s > e.x && b.y < e.y + s && b.y + s > e.y);
    if (overlap) {
      this.sfx.deny();
      return false;
    }
    this.extraBouncers.push(b);
    if (!this.freePlace) {
      this.money -= this.extraBouncerCost;
    }
    this.sfx.buy();
    this.markSaveDirty();
    return true;
  }

  private removeExtraBouncersNear(x: number, y: number): void {
    const s = this.blockSize;
    const r = this.fanEraserRadius();
    let removed = false;
    for (let i = this.extraBouncers.length - 1; i >= 0; i--) {
      const b = this.extraBouncers[i];
      if (x >= b.x - r && x <= b.x + s + r && y >= b.y - r && y <= b.y + s + r) {
        if (this.dragged === b) {
          this.dragged = null;
        }
        this.extraBouncers.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      this.markSaveDirty();
    }
  }

  private removeExtraBouncersAlong(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.fanEraserRadius();
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, r)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.removeExtraBouncersNear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  private clampProducerPos(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.min(Math.max(Math.round(x), 0), Math.max(0, this.worldW - this.producerW)),
      y: Math.min(Math.max(Math.round(y), 0), Math.max(0, this.worldH - this.producerH)),
    };
  }

  private hitProducerIndex(x: number, y: number): number {
    for (let i = 0; i < this.producers.length; i++) {
      const p = this.producers[i];
      if (x < p.x + this.producerW && x + this.producerW > p.x && y < p.y + this.producerH && y + this.producerH > p.y) {
        return i;
      }
    }
    return -1;
  }

  private hitProducerPoint(px: number, py: number): number {
    for (let i = 0; i < this.producers.length; i++) {
      const p = this.producers[i];
      if (px >= p.x && px < p.x + this.producerW && py >= p.y && py < p.y + this.producerH) {
        return i;
      }
    }
    return -1;
  }

  private placeProducer(sx: number, sy: number): boolean {
    if (!this.freePlace && this.money < this.producerCost) {
      this.sfx.deny();
      return false;
    }
    const pos = this.clampProducerPos(sx - this.producerW / 2, sy - this.producerH / 2);
    if (this.hitProducerIndex(pos.x, pos.y) >= 0) {
      this.sfx.deny();
      return false;
    }
    if (!this.freePlace) {
      this.money -= this.producerCost;
    }
    this.sfx.buy();
    this.createProducer(pos.x, pos.y);
    this.markSaveDirty();
    return true;
  }

  private removeProducer(i: number): void {
    const pr = this.producers[i];
    for (const d of this.droppers) {
      if (d.producer === pr) {
        d.producer = null;
        d.trailPts.length = 0;
      }
    }
    if (this.draggedProducer === pr) {
      this.draggedProducer = null;
    }
    if (this.selectedProducer === pr) {
      this.selectedProducer = null;
    }
    this.producers.splice(i, 1);
  }

  private removeProducersNear(x: number, y: number): void {
    const r = this.fanEraserRadius();
    let removed = false;
    for (let i = this.producers.length - 1; i >= 0; i--) {
      const p = this.producers[i];
      if (x >= p.x - r && x <= p.x + this.producerW + r && y >= p.y - r && y <= p.y + this.producerH + r) {
        this.removeProducer(i);
        removed = true;
      }
    }
    if (removed) {
      this.markSaveDirty();
    }
  }

  private removeProducersAlong(x0: number, y0: number, x1: number, y1: number): void {
    const r = this.fanEraserRadius();
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, r)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.removeProducersNear(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  private producerSpeedCost(p: Producer): number {
    return Math.round(this.producerSpeedBase * Math.pow(this.producerSpeedGrowth, p.speedLv));
  }

  private producerCountCost(p: Producer): number {
    return Math.round(this.producerCountBase * Math.pow(this.producerCountGrowth, p.countLv));
  }

  private producerTrailCost(p: Producer): number {
    return Math.round(this.producerTrailBase * Math.pow(this.producerTrailGrowth, p.trailLv));
  }

  private tryBuyProducerUpgrade(kind: 'speed' | 'count' | 'trail'): void {
    const p = this.selectedProducer;
    if (!p) return;
    if (kind === 'trail' && p.trailLv >= 2) {
      this.sfx.deny();
      return;
    }
    const cost =
      kind === 'speed' ? this.producerSpeedCost(p) : kind === 'count' ? this.producerCountCost(p) : this.producerTrailCost(p);
    if (this.money < cost) {
      this.sfx.deny();
      return;
    }
    this.money -= cost;
    if (kind === 'speed') {
      p.speedLv++;
    } else if (kind === 'count') {
      p.countLv++;
      this.droppers.push(this.createDropper(p));
    } else {
      p.trailLv++;
    }
    this.sfx.buy();
    this.markSaveDirty();
  }

  private downgradeProducerTrail(): void {
    const p = this.selectedProducer;
    if (!p || p.trailLv <= 0) {
      this.sfx.deny();
      return;
    }
    this.money += this.producerTrailCost(p);
    p.trailLv--;
    if (p.trailLv < 2) {
      for (const d of this.droppers) {
        if (d.producer === p) {
          d.trailPts.length = 0;
        }
      }
    }
    this.sfx.buy();
    this.markSaveDirty();
  }

  private producerMenuGeom(): { x: number; y: number; w: number; rowH: number; pad: number; header: number } {
    const rowH = 42;
    const pad = 10;
    const header = 26;
    return {
      x: Math.round(this.canvas.width / 2 - 170),
      y: this.canvas.height - (header + 3 * (rowH + 8) + pad) - 12,
      w: 340,
      rowH,
      pad,
      header,
    };
  }

  private hitProducerMenu(px: number, py: number): 'speed' | 'count' | 'trail' | 'close' | null {
    const p = this.selectedProducer;
    if (!p) return null;
    const g = this.producerMenuGeom();
    const panelH = g.header + 3 * (g.rowH + 8) + g.pad;
    if (px < g.x || px > g.x + g.w || py < g.y || py > g.y + panelH) return null;
    const closeX = g.x + g.w - g.pad - 26;
    const closeY = g.y + g.pad - 2;
    if (px >= closeX && px <= closeX + 26 && py >= closeY && py <= closeY + 20) return 'close';
    const rowsTop = g.y + g.header;
    for (let i = 0; i < 3; i++) {
      const ry = rowsTop + i * (g.rowH + 8);
      const bx = g.x + g.w - g.pad - 120;
      const by = ry + (g.rowH - 26) / 2;
      if (px >= bx && px <= bx + 120 && py >= by && py <= by + 26) {
        return i === 0 ? 'speed' : i === 1 ? 'count' : 'trail';
      }
    }
    return null;
  }

  private fanRangeOf(f: Fan): number {
    return this.fanRangeBase * Math.pow(this.fanRangeGrowth, f.reachLv);
  }

  private fanPowerOf(f: Fan): number {
    return this.fanPowerBase * Math.pow(this.fanPowerGrowth, f.powerLv);
  }

  private fanReachCost(f: Fan): number {
    return Math.round(this.fanReachUpBase * Math.pow(this.fanReachUpGrowth, f.reachLv));
  }

  private fanPowerCost(f: Fan): number {
    return Math.round(this.fanPowerUpBase * Math.pow(this.fanPowerUpGrowth, f.powerLv));
  }

  private tryBuyFanUpgrade(kind: 'power' | 'reach'): void {
    const f = this.selectedFan;
    if (!f) return;
    const cost = kind === 'power' ? this.fanPowerCost(f) : this.fanReachCost(f);
    if (this.money < cost) {
      this.sfx.deny();
      return;
    }
    this.money -= cost;
    if (kind === 'power') {
      f.powerLv++;
    } else {
      f.reachLv++;
    }
    this.sfx.buy();
    this.markSaveDirty();
  }

  private fanMenuGeom(): { x: number; y: number; w: number; rowH: number; pad: number; header: number } {
    const rowH = 42;
    const pad = 10;
    const header = 26;
    return {
      x: Math.round(this.canvas.width / 2 - 170),
      y: this.canvas.height - (header + 2 * (rowH + 8) + pad) - 12,
      w: 340,
      rowH,
      pad,
      header,
    };
  }

  private hitFanMenu(px: number, py: number): 'power' | 'reach' | 'close' | null {
    const f = this.selectedFan;
    if (!f) return null;
    const g = this.fanMenuGeom();
    const panelH = g.header + 2 * (g.rowH + 8) + g.pad;
    if (px < g.x || px > g.x + g.w || py < g.y || py > g.y + panelH) return null;
    const closeX = g.x + g.w - g.pad - 26;
    const closeY = g.y + g.pad - 2;
    if (px >= closeX && px <= closeX + 26 && py >= closeY && py <= closeY + 20) return 'close';
    const rowsTop = g.y + g.header;
    for (let i = 0; i < 2; i++) {
      const ry = rowsTop + i * (g.rowH + 8);
      const bx = g.x + g.w - g.pad - 120;
      const by = ry + (g.rowH - 26) / 2;
      if (px >= bx && px <= bx + 120 && py >= by && py <= by + 26) {
        return i === 0 ? 'power' : 'reach';
      }
    }
    return null;
  }

  private updateFans(dt: number): void {
    if (this.fans.length === 0 || this.droppers.length === 0) return;
    const s = this.fanSize;
    for (const d of this.droppers) {
      if (!d.alive || this.dragged === d) continue;
      const dcx = d.x + this.blockSize / 2;
      const dcy = d.y + this.blockSize / 2;
      for (const f of this.fans) {
        const fcx = f.x + s / 2;
        const fcy = f.y + s / 2;
        const range = this.fanRangeOf(f);
        const ox = dcx - fcx;
        const oy = dcy - fcy;
        const dist = Math.hypot(ox, oy);
        if (dist > range) continue;
        const t = ox * f.dirX + oy * f.dirY;
        if (t < 0 || t > range) continue;
        const side = Math.abs(ox * f.dirY - oy * f.dirX);
        const halfW = s * 0.55 + t * 0.55;
        if (side > halfW) continue;
        if (this.lineBlocked(fcx, fcy, dcx, dcy)) continue;
        const fall = (1 - t / range) * (1 - Math.min(1, side / halfW));
        if (fall <= 0) continue;
        const accel = this.fanPowerOf(f) * fall;
        d.vx += f.dirX * accel * dt;
        d.vy += f.dirY * accel * dt;
        const sp = Math.hypot(d.vx, d.vy);
        if (sp > this.fanMaxSpeed) {
          d.vx = (d.vx / sp) * this.fanMaxSpeed;
          d.vy = (d.vy / sp) * this.fanMaxSpeed;
        }
      }
    }
  }

  private lineBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    const pad = 1;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1)) - pad);
    const minY = Math.max(0, Math.floor(Math.min(y0, y1)) - pad);
    const maxX = Math.min(this.worldW - 1, Math.ceil(Math.max(x0, x1)) + pad);
    const maxY = Math.min(this.worldH - 1, Math.ceil(Math.max(y0, y1)) + pad);
    if (maxX < minX || maxY < minY) return false;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const data = this.solidCtx.getImageData(minX, minY, w, h).data;
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = Math.round(x0 + (x1 - x0) * t);
      const py = Math.round(y0 + (y1 - y0) * t);
      if (data[(py - minY) * w * 4 + (px - minX) * 4 + 3] !== 0) {
        return true;
      }
    }
    return false;
  }

  private renderWorldProducers(): void {
    const mx = this.mouseX / this.zoom + this.camX;
    const my = this.mouseY / this.zoom + this.camY;
    this.hoveredProducerIndex = this.hitProducerPoint(mx, my);
    for (let i = 0; i < this.producers.length; i++) {
      const p = this.producers[i];
      this.drawProducerShape(p.x, p.y, 1);
      if (i === this.hoveredProducerIndex || this.selectedProducer === p) {
        this.drawProducerHighlight(p.x, p.y, this.selectedProducer === p);
      }
    }
    if (this.objectMode !== 'producer' || this.erasing) return;
    const pos = this.clampProducerPos(
      (this.producerDrag ? this.producerDrag.x : mx) - this.producerW / 2,
      (this.producerDrag ? this.producerDrag.y : my) - this.producerH / 2,
    );
    this.drawProducerShape(pos.x, pos.y, this.producerDrag ? 0.85 : 0.5, this.freePlace || this.money >= this.producerCost);
  }

  private drawProducerHighlight(x: number, y: number, selected: boolean): void {
    const { ctx } = this;
    ctx.strokeStyle = selected ? 'rgba(255, 215, 0, 0.95)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 2, y - 2, this.producerW + 4, this.producerH + 4);
    ctx.setLineDash([]);
  }

  private drawProducerShape(x: number, y: number, alpha: number, affordable = true): void {
    const { ctx } = this;
    const w = this.producerW;
    const h = this.producerH;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = affordable ? '#3d3d3d' : 'rgba(180, 60, 60, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.fillRect(x + w / 2 - 7, y + h - 14, 14, 14);
    ctx.strokeStyle = 'rgba(255, 220, 120, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + w / 2 - 7, y + h - 14, 14, 14);
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(x + w - 14, y - 8, 8, 10);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.strokeRect(x + w - 14, y - 8, 8, 10);
    ctx.restore();
  }

  private renderProducerMenu(): void {
    const p = this.selectedProducer;
    if (!p) return;
    const { ctx } = this;
    const g = this.producerMenuGeom();
    const panelH = g.header + 3 * (g.rowH + 8) + g.pad;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.92)';
    ctx.fillRect(g.x, g.y, g.w, panelH);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.strokeRect(g.x, g.y, g.w, panelH);
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('PRODUCER', g.x + g.pad, g.y + g.pad + 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText('x', g.x + g.w - g.pad - 9, g.y + g.pad + 10);
    ctx.textAlign = 'left';

    const rowsTop = g.y + g.header;
    const respawn = this.producerRespawnTime(p);
    const trailMaxed = p.trailLv >= 2;
    const rows: ReadonlyArray<readonly [string, string, number]> = [
      [`Respawn Speed  Lv ${p.speedLv}`, `${respawn.toFixed(2)}s between respawns`, this.producerSpeedCost(p)],
      [`Dropper Count  Lv ${p.countLv}`, `${1 + p.countLv} droppers active`, this.producerCountCost(p)],
      [`Trail  Lv ${p.trailLv}`, `Lv2+ leaves a line behind droppers`, trailMaxed ? 0 : this.producerTrailCost(p)],
    ];
    for (let i = 0; i < 3; i++) {
      const ry = rowsTop + i * (g.rowH + 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(g.x + g.pad, ry, g.w - g.pad * 2, g.rowH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(rows[i][0], g.x + g.pad + 8, ry + 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(rows[i][1], g.x + g.pad + 8, ry + 31);
      const bx = g.x + g.w - g.pad - 120;
      const by = ry + (g.rowH - 26) / 2;
      const maxed = i === 2 && trailMaxed;
      const afford = maxed ? false : this.money >= rows[i][2];
      ctx.fillStyle = maxed ? 'rgba(90, 90, 90, 0.85)' : afford ? 'rgba(255, 215, 0, 0.85)' : 'rgba(120, 90, 20, 0.85)';
      ctx.fillRect(bx, by, 120, 26);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(bx, by, 120, 26);
      ctx.fillStyle = maxed ? 'rgba(255, 255, 255, 0.85)' : afford ? '#111111' : 'rgba(255, 255, 255, 0.85)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(maxed ? 'MAX' : `$${rows[i][2]}`, bx + 60, by + 17);
      ctx.textAlign = 'left';
    }
  }

  private renderFanMenu(): void {
    const f = this.selectedFan;
    if (!f) return;
    const { ctx } = this;
    const g = this.fanMenuGeom();
    const panelH = g.header + 2 * (g.rowH + 8) + g.pad;
    ctx.fillStyle = 'rgba(30, 30, 30, 0.92)';
    ctx.fillRect(g.x, g.y, g.w, panelH);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.strokeRect(g.x, g.y, g.w, panelH);
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('FAN', g.x + g.pad, g.y + g.pad + 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText('x', g.x + g.w - g.pad - 9, g.y + g.pad + 10);
    ctx.textAlign = 'left';

    const rowsTop = g.y + g.header;
    const rows: ReadonlyArray<readonly [string, string, number]> = [
      [`Power  Lv ${f.powerLv}`, `push strength ${Math.round(this.fanPowerOf(f))}`, this.fanPowerCost(f)],
      [`Reach  Lv ${f.reachLv}`, `range ${Math.round(this.fanRangeOf(f))}px`, this.fanReachCost(f)],
    ];
    for (let i = 0; i < 2; i++) {
      const ry = rowsTop + i * (g.rowH + 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(g.x + g.pad, ry, g.w - g.pad * 2, g.rowH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(rows[i][0], g.x + g.pad + 8, ry + 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(rows[i][1], g.x + g.pad + 8, ry + 31);
      const bx = g.x + g.w - g.pad - 120;
      const by = ry + (g.rowH - 26) / 2;
      const afford = this.money >= rows[i][2];
      ctx.fillStyle = afford ? 'rgba(255, 215, 0, 0.85)' : 'rgba(120, 90, 20, 0.85)';
      ctx.fillRect(bx, by, 120, 26);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(bx, by, 120, 26);
      ctx.fillStyle = afford ? '#111111' : 'rgba(255, 255, 255, 0.85)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`$${rows[i][2]}`, bx + 60, by + 17);
      ctx.textAlign = 'left';
    }
  }

  private renderWorldFans(): void {
    const { ctx } = this;
    const mx = this.mouseX / this.zoom + this.camX;
    const my = this.mouseY / this.zoom + this.camY;
    this.hoveredFanIndex = this.hitFanPoint(mx, my);
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      this.drawFanShape(f.x, f.y, f.dirX, f.dirY, 1);
      if (i === this.hoveredFanIndex || this.selectedFan === f) {
        this.drawFanHighlight(f.x, f.y, this.selectedFan === f);
      }
    }
    if (this.selectedFan) {
      const f = this.selectedFan;
      const cx = f.x + this.fanSize / 2;
      const cy = f.y + this.fanSize / 2;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, this.fanRangeOf(f), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.objectMode !== 'fan' || this.erasing) return;
    const pos = this.clampFanPos((this.fanDrag ? this.fanDrag.x : mx) - this.fanSize / 2, (this.fanDrag ? this.fanDrag.y : my) - this.fanSize / 2);
    const cx = pos.x + this.fanSize / 2;
    const cy = pos.y + this.fanSize / 2;
    let dx = 1;
    let dy = 0;
    if (this.fanDrag) {
      const ox = mx - cx;
      const oy = my - cy;
      const len = Math.hypot(ox, oy);
      if (len > 10) {
        dx = ox / len;
        dy = oy / len;
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawFanShape(pos.x, pos.y, dx, dy, this.fanDrag ? 0.85 : 0.5, this.freePlace || this.money >= this.fanCost);
  }

  private renderWorldExtraBouncers(): void {
    if (this.objectMode !== 'destroyer' || this.erasing) return;
    const mx = this.mouseX / this.zoom + this.camX;
    const my = this.mouseY / this.zoom + this.camY;
    const s = this.blockSize;
    const pos = this.clampExtraBouncerPos(
      (this.bouncerDrag ? this.bouncerDrag.x : mx) - s / 2,
      (this.bouncerDrag ? this.bouncerDrag.y : my) - s / 2,
    );
    const { ctx } = this;
    ctx.globalAlpha = this.bouncerDrag ? 0.85 : 0.5;
    this.renderBouncerBody({ x: pos.x, y: pos.y, vx: 0, vy: 0 }, false);
    ctx.globalAlpha = 1;
    if (!this.freePlace && this.money < this.extraBouncerCost) {
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(pos.x - 2, pos.y - 2, s + 4, s + 4);
      ctx.setLineDash([]);
    }
  }

  private drawFanHighlight(x: number, y: number, selected = false): void {
    const { ctx } = this;
    const s = this.fanSize;
    ctx.strokeStyle = selected ? 'rgba(255, 215, 0, 0.95)' : 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 2, y - 2, s + 4, s + 4);
    ctx.setLineDash([]);
  }

  private drawFanShape(x: number, y: number, dirX: number, dirY: number, alpha: number, affordable = true): void {
    const { ctx } = this;
    const s = this.fanSize;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = affordable ? 'rgba(217, 164, 65, 0.8)' : 'rgba(180, 60, 60, 0.85)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, s, s);
    const cx = x + s / 2;
    const cy = y + s / 2;
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dirY, dirX));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(s / 2 + 12, 0);
    ctx.lineTo(s / 2 + 1, -6);
    ctx.lineTo(s / 2 + 1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(this.time * 7);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(-s * 0.3, -s * 0.09, s * 0.6, s * 0.18);
    ctx.restore();
    ctx.fillStyle = 'rgba(58, 58, 58, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private update(dt: number): void {
    this.sfx.ensure();
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 2;
      if (this.saveDirty) {
        this.saveDirty = false;
        void this.save();
      }
    }
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    this.bounceSoundTimer = Math.max(0, this.bounceSoundTimer - dt);
    this.borderSoundTimer = Math.max(0, this.borderSoundTimer - dt);
    if (this.dragged !== this.bouncer) {
      this.updateBouncer(dt);
    }
    for (const d of this.droppers) {
      if (d.alive) {
        if (d.gold) {
          this.emitGoldParticles(d, dt);
        }
        if (d.producer && d.producer.trailLv > 0) {
          this.emitTrailParticles(d, dt);
        }
        this.updateTrail(d);
        if (this.dragged !== d) {
          this.updateDropper(d, dt);
        }
      }
    }
    this.updateFans(dt);
    this.checkDropperCollision();
    this.checkStuckDroppers(dt);
    this.respawnDropper(dt);
    this.updateParticles(dt);
    this.updateSplats(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      if (this.time - this.rings[i].born >= this.rings[i].life) {
        this.rings.splice(i, 1);
      }
    }
    const life = this.splatLifetime();
    for (let i = this.splats.length - 1; i >= 0; i--) {
      if (this.time - this.splats[i].born >= life + 0.5) {
        this.splats.splice(i, 1);
      }
    }
    if (this.splats.length > 400) {
      this.splats.splice(0, this.splats.length - 400);
    }
  }

  private render(): void {
    const { ctx } = this;
    const tw = this.canvas.width;
    const th = this.canvas.height;
    const tile = 40;
    const grout = 3;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.translate(-this.camX * this.zoom, -this.camY * this.zoom);
    ctx.scale(this.zoom, this.zoom);

    const ww = this.worldW;
    const wh = this.worldH;
    const vx0 = Math.max(0, Math.floor(this.camX / tile) * tile);
    const vy0 = Math.max(0, Math.floor(this.camY / tile) * tile);
    const vx1 = Math.min(ww, this.camX + tw / this.zoom);
    const vy1 = Math.min(wh, this.camY + th / this.zoom);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.fillStyle = '#000000';
    for (let ty = vy0; ty < vy1; ty += tile) {
      for (let tx = vx0; tx < vx1; tx += tile) {
        ctx.fillRect(tx, ty, tile - grout, tile - grout);
      }
    }

    ctx.drawImage(this.layer, 0, 0);

    const life = this.splatLifetime();
    for (let i = this.worldStains.length - 1; i >= 0; i--) {
      const ws = this.worldStains[i];
      const age = this.time - ws.born;
      if (age >= life) {
        this.worldStains.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = ws.alpha * (1 - age / life);
      ctx.fillStyle = ws.color;
      ctx.fillRect(ws.x - ws.size / 2, ws.y - ws.size / 2, ws.size, ws.size);
    }
    ctx.globalAlpha = 1;

    this.renderSplats();

    this.renderBouncerBody(this.bouncer, true);
    for (const b of this.extraBouncers) {
      this.renderBouncerBody(b, false);
    }

    for (const d of this.droppers) {
      if (d.alive) {
        this.renderTrail(d);
        ctx.fillStyle = d.gold ? '#ffd700' : d.color;
        ctx.fillRect(d.x, d.y, this.blockSize, this.blockSize);
      }
    }

    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const ring of this.rings) {
      const age = this.time - ring.born;
      const t = age / ring.life;
      if (t < 0 || t >= 1) continue;
      const r = ring.maxR * (1 - Math.pow(1 - t, 3));
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.renderWorldProducers();
    this.renderWorldFans();
    this.renderWorldExtraBouncers();
    ctx.restore();

    this.renderUpgrades();
    this.renderSettings();
    this.renderObjectsMenu();
    this.renderProducerMenu();
    this.renderFanMenu();
    this.renderSecretMenu();

    const bh = 30;
    const bx = 12;
    const by = this.canvas.height - bh - 12;
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`money: $${this.money}   producers: ${this.producers.length}`, bx, by + bh / 2 + 4.5);

    if (this.erasing) {
      const r = (this.eraserWidth * this.deviceScale * this.zoom) / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
