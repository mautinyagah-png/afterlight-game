
import { GAME_CONFIG, DISTRICTS, MISSION_POOL, POWER_INFO } from './config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const random = (min, max) => min + Math.random() * (max - min);
const pick = (array) => array[Math.floor(Math.random() * array.length)];

export class AfterlightGame {
  constructor(canvas, audio, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.audio = audio;
    this.callbacks = callbacks;
    this.width = 800;
    this.height = 600;
    this.dpr = 1;
    this.state = 'idle';
    this.mode = 'endless';
    this.lastFrame = 0;
    this.frameId = 0;
    this.uiClock = 0;
    this.toastClock = 0;
    this.toastText = '';
    this.bgOffset = 0;
    this.buildings = [];
    this.stars = [];
    this.resetRunData();
    this.resize();
    this.createScenery();
    this.boundResize = () => this.resize();
    window.addEventListener('resize', this.boundResize, { passive: true });
  }

  resetRunData() {
    this.elapsed = 0;
    this.distance = 0;
    this.score = 0;
    this.energy = 0;
    this.health = GAME_CONFIG.maxHealth;
    this.speed = GAME_CONFIG.startSpeed;
    this.player = { lane: 1, laneVisual: 1, jumpTime: 0, slideTime: 0, hitTime: 0, invulnerable: 0, tilt: 0 };
    this.objects = [];
    this.particles = [];
    this.effects = [];
    this.obstacleTimer = 1.3;
    this.crystalTimer = .35;
    this.powerTimer = 9;
    this.timeLeft = GAME_CONFIG.timeAttackSeconds;
    this.combo = 0;
    this.multiplier = 1;
    this.avoided = 0;
    this.powerupsCollected = 0;
    this.hitsTaken = 0;
    this.shield = false;
    this.magnetTime = 0;
    this.overdriveTime = 0;
    this.phaseTime = 0;
    this.activePower = '';
    this.missions = [];
    this.completedMissions = 0;
    this.spawnCount = 0;
    this.lastDistrict = 0;
    this.runEnded = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.render();
  }

  createScenery() {
    this.buildings = [];
    this.stars = [];
    for (let i = 0; i < 34; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.buildings.push({ side, x: Math.random(), width: random(22, 75), height: random(.12, .48), seed: Math.random(), speed: random(.18, .55) });
    }
    for (let i = 0; i < 75; i++) this.stars.push({ x: Math.random(), y: Math.random() * .46, r: random(.4, 1.5), a: random(.2, .8), phase: random(0, 7) });
  }

  start(mode = 'endless') {
    this.stopLoop();
    this.resetRunData();
    this.setupMissions();
    this.mode = mode === 'time' ? 'time' : 'endless';
    this.state = 'running';
    this.lastFrame = performance.now();
    this.callbacks.onStart?.(this.snapshot());
    this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  stopLoop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  destroy() {
    this.stopLoop();
    window.removeEventListener('resize', this.boundResize);
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.stopLoop();
    this.callbacks.onPause?.(this.snapshot());
    this.render();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.lastFrame = performance.now();
    this.callbacks.onResume?.(this.snapshot());
    this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  move(direction) {
    if (this.state !== 'running') return;
    const next = clamp(this.player.lane + direction, 0, 2);
    if (next === this.player.lane) return;
    this.player.lane = next;
    this.player.tilt = direction;
    this.audio?.play('click');
  }

  jump() {
    if (this.state !== 'running' || this.player.jumpTime > 0 || this.player.slideTime > 0) return;
    this.player.jumpTime = GAME_CONFIG.jumpDuration;
    this.audio?.play('jump');
  }

  slide() {
    if (this.state !== 'running' || this.player.slideTime > 0 || this.player.jumpTime > 0) return;
    this.player.slideTime = GAME_CONFIG.slideDuration;
    this.audio?.play('slide');
  }

  loop(now) {
    if (this.state !== 'running') return;
    const dt = Math.min((now - this.lastFrame) / 1000, .035);
    this.lastFrame = now;
    this.update(dt);
    this.render();
    this.uiClock += dt;
    if (this.uiClock >= .1) {
      this.uiClock = 0;
      this.callbacks.onUpdate?.(this.snapshot());
    }
    if (this.state === 'running') this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  update(dt) {
    if (this.runEnded) return;
    this.elapsed += dt;
    this.distance += this.speed * dt * GAME_CONFIG.distanceRate;
    this.score += dt * GAME_CONFIG.scorePerSecond * this.multiplier;
    this.speed = Math.min(GAME_CONFIG.maxSpeed, GAME_CONFIG.startSpeed + this.elapsed * GAME_CONFIG.speedIncrease);
    this.bgOffset += dt * this.speed * .025;
    this.player.laneVisual += (this.player.lane - this.player.laneVisual) * Math.min(1, dt * 13);
    this.player.tilt += (0 - this.player.tilt) * Math.min(1, dt * 5);
    this.player.jumpTime = Math.max(0, this.player.jumpTime - dt);
    this.player.slideTime = Math.max(0, this.player.slideTime - dt);
    this.player.hitTime = Math.max(0, this.player.hitTime - dt);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    this.magnetTime = Math.max(0, this.magnetTime - dt);
    this.overdriveTime = Math.max(0, this.overdriveTime - dt);
    this.phaseTime = Math.max(0, this.phaseTime - dt);
    if (this.overdriveTime <= 0 && this.activePower === 'overdrive') this.activePower = '';
    if (this.magnetTime <= 0 && this.activePower === 'magnet') this.activePower = '';
    if (this.phaseTime <= 0 && this.activePower === 'phase') this.activePower = '';
    this.refreshMultiplier();
    if (this.mode === 'time') {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) { this.finishRun('time'); return; }
    }

    this.obstacleTimer -= dt;
    this.crystalTimer -= dt;
    this.powerTimer -= dt;
    if (this.obstacleTimer <= 0) this.spawnObstaclePattern();
    if (this.crystalTimer <= 0) this.spawnCrystals();
    if (this.powerTimer <= 0) this.spawnPowerup();

    const worldDelta = this.speed * dt;
    for (const object of this.objects) object.z -= worldDelta;
    this.processObjects();
    this.updateMissions(dt);
    this.updateParticles(dt);
    this.updateDistrict();
    if (this.health <= 0) this.finishRun('crash');
  }

  spawnObstaclePattern() {
    this.obstacleTimer = random(GAME_CONFIG.obstacleSpawnMin, GAME_CONFIG.obstacleSpawnMax) * (this.speed > 35 ? .92 : 1);
    const lane = Math.floor(Math.random() * 3);
    const types = ['barrier', 'laser', 'drone', 'wall', 'electric'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.objects.push({ kind: 'obstacle', type, lane, z: GAME_CONFIG.worldDepth, resolved: false, seed: Math.random() });
    this.spawnCount++;
    // A second, distant crystal trail adds choice without blocking every lane.
    if (this.spawnCount % 3 === 0) {
      const safeLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      for (let i = 0; i < 3; i++) this.objects.push({ kind: 'crystal', lane: safeLane, z: GAME_CONFIG.worldDepth + 10 + i * 5, collected: false, seed: Math.random() });
    }
  }

  spawnCrystals() {
    this.crystalTimer = random(GAME_CONFIG.crystalSpawnMin, GAME_CONFIG.crystalSpawnMax);
    const lane = Math.floor(Math.random() * 3);
    this.objects.push({ kind: 'crystal', lane, z: GAME_CONFIG.worldDepth + random(0, 8), collected: false, seed: Math.random() });
  }

  spawnPowerup() {
    this.powerTimer = random(GAME_CONFIG.powerSpawnMin, GAME_CONFIG.powerSpawnMax);
    const type = pick(['shield', 'magnet', 'overdrive', 'phase']);
    const lane = Math.floor(Math.random() * 3);
    this.objects.push({ kind: 'power', type, lane, z: GAME_CONFIG.worldDepth + 4, collected: false, seed: Math.random() });
  }

  processObjects() {
    const playerLane = Math.round(this.player.laneVisual);
    for (const object of this.objects) {
      if (object.z > GAME_CONFIG.playerDepth + 4 || object.z < -4) continue;
      if (object.kind === 'crystal' && !object.collected) {
        const magnetPull = this.magnetTime > 0;
        if (object.lane === playerLane || (magnetPull && Math.abs(object.lane - playerLane) <= 1)) {
          object.collected = true;
          this.collectCrystal();
        }
      } else if (object.kind === 'power' && !object.collected && object.lane === playerLane) {
        object.collected = true;
        this.activatePower(object.type);
      } else if (object.kind === 'obstacle' && !object.resolved && object.z <= GAME_CONFIG.playerDepth) {
        object.resolved = true;
        if (object.lane !== playerLane) {
          this.avoidObstacle(object.type);
        } else if (this.phaseTime > 0) {
          this.avoidObstacle(object.type, false);
        } else if (object.type === 'barrier' && this.player.jumpTime > .05) {
          this.avoidObstacle(object.type);
          this.updateMissionProgress('jump', 1);
        } else if (object.type === 'laser' && this.player.slideTime > .05) {
          this.avoidObstacle(object.type);
          this.updateMissionProgress('slide', 1);
        } else {
          this.takeHit();
        }
      }
    }
    this.objects = this.objects.filter((object) => object.z > -3 && !(object.kind === 'crystal' && object.collected) && !(object.kind === 'power' && object.collected) && !(object.kind === 'obstacle' && object.resolved));
  }

  refreshMultiplier() {
    const baseMultiplier = Math.min(5, 1 + Math.floor(this.combo / 3));
    this.multiplier = this.overdriveTime > 0 ? baseMultiplier * 2 : baseMultiplier;
  }

  collectCrystal() {
    this.energy++;
    this.score += GAME_CONFIG.crystalScore * this.multiplier;
    this.combo++;
    this.refreshMultiplier();
    this.audio?.play('collect');
    this.burst(this.playerScreenX(), this.playerScreenY() - 20, '#49eff4', 9);
    this.showToast('+ ENERGY');
    this.updateMissionProgress('crystals', 1);
  }

  avoidObstacle(type, award = true) {
    this.avoided++;
    if (award) {
      this.combo++;
      this.score += GAME_CONFIG.obstacleBonus * this.multiplier;
      this.refreshMultiplier();
      if (this.combo > 0 && this.combo % 3 === 0) this.audio?.play('combo');
    }
    if (type === 'barrier') this.updateMissionProgress('jump', 0);
    if (type === 'laser') this.updateMissionProgress('slide', 0);
    this.burst(this.playerScreenX(), this.playerScreenY() - 12, '#91a8ff', 3);
  }

  takeHit() {
    if (this.player.invulnerable > 0) return;
    if (this.shield) {
      this.shield = false;
      if (this.activePower === 'shield') this.activePower = '';
      this.player.invulnerable = .65;
      this.audio?.play('shield');
      this.showToast('SHIELD SAVED YOU!');
      this.burst(this.playerScreenX(), this.playerScreenY() - 20, '#4ceafa', 22);
      return;
    }
    this.health--;
    this.hitsTaken++;
    this.combo = 0;
    this.multiplier = 1;
    this.player.invulnerable = GAME_CONFIG.invulnerabilityTime;
    this.player.hitTime = .32;
    this.audio?.play('hit');
    this.showToast(this.health > 0 ? 'DAMAGE TAKEN' : 'SIGNAL LOST');
    this.burst(this.playerScreenX(), this.playerScreenY() - 15, '#ff547b', 18);
    this.callbacks.onHit?.(this.health);
  }

  activatePower(type) {
    this.powerupsCollected++;
    this.score += GAME_CONFIG.powerScore;
    this.activePower = type;
    if (type === 'shield') this.shield = true;
    if (type === 'magnet') this.magnetTime = 7;
    if (type === 'overdrive') this.overdriveTime = 6;
    if (type === 'phase') this.phaseTime = 3.5;
    this.refreshMultiplier();
    this.audio?.play('power');
    this.showToast(POWER_INFO[type]?.name || 'POWER-UP');
    this.burst(this.playerScreenX(), this.playerScreenY() - 30, POWER_INFO[type]?.color || '#fff', 18);
    this.updateMissionProgress('power', 1);
  }

  setupMissions() {
    const selected = [...MISSION_POOL].sort(() => Math.random() - .5).slice(0, 3);
    this.missions = selected.map((mission) => ({ ...mission, progress: 0, done: false }));
  }

  updateMissions(dt) {
    const survival = this.missions.find((mission) => mission.id === 'survive' && !mission.done);
    if (survival) this.updateMissionProgress('survive', dt);
    const distance = this.missions.find((mission) => mission.id === 'distance' && !mission.done);
    if (distance) {
      distance.progress = Math.min(distance.target, Math.floor(this.distance));
      if (distance.progress >= distance.target) this.completeMission(distance);
    }
  }

  updateMissionProgress(id, amount) {
    if (!amount) return;
    for (const mission of this.missions) {
      if (mission.id !== id || mission.done) continue;
      mission.progress = Math.min(mission.target, mission.progress + amount);
      if (mission.progress >= mission.target) this.completeMission(mission);
    }
  }

  completeMission(mission) {
    if (mission.done) return;
    mission.done = true;
    this.completedMissions++;
    this.score += mission.reward;
    this.audio?.play('mission');
    this.showToast('MISSION COMPLETE +' + mission.reward);
    this.callbacks.onMission?.(mission);
  }

  updateDistrict() {
    let index = 0;
    for (let i = 0; i < DISTRICTS.length; i++) if (this.distance >= DISTRICTS[i].at) index = i;
    if (index !== this.lastDistrict) {
      this.lastDistrict = index;
      this.audio?.play('district');
      this.callbacks.onDistrict?.(DISTRICTS[index]);
      if (index > 0) this.showToast(DISTRICTS[index].name);
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.life -= dt;
      particle.size *= 1 - dt * .6;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0 && particle.size > .2).slice(-GAME_CONFIG.maxParticles);
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter((effect) => effect.life > 0);
    if (this.toastClock > 0) this.toastClock -= dt;
  }

  burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = random(25, 135);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 38, life: random(.25, .75), maxLife: .75, size: random(1.5, 4), color });
    }
  }

  showToast(message) {
    this.toastText = message;
    this.toastClock = 1.05;
    this.callbacks.onToast?.(message);
  }

  playerScreenX() {
    const t = .9;
    return this.laneX(this.player.laneVisual, t);
  }

  playerScreenY() { return this.height * .82; }

  finishRun(reason) {
    if (this.runEnded) return;
    this.runEnded = true;
    this.state = 'over';
    this.stopLoop();
    const result = {
      reason,
      mode: this.mode,
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      energy: this.energy,
      avoided: this.avoided,
      hits: this.hitsTaken,
      powerups: this.powerupsCollected,
      missionsCompleted: this.completedMissions,
      missions: this.missions.map((mission) => ({ ...mission })),
      elapsed: Math.floor(this.elapsed),
      combo: this.combo,
      health: this.health
    };
    this.audio?.play('gameover');
    this.callbacks.onEnd?.(result);
    this.render();
  }

  snapshot() {
    const active = this.activePower;
    let powerRemaining = 0;
    if (active === 'magnet') powerRemaining = this.magnetTime;
    if (active === 'overdrive') powerRemaining = this.overdriveTime;
    if (active === 'phase') powerRemaining = this.phaseTime;
    return {
      mode: this.mode, state: this.state, score: Math.floor(this.score), distance: Math.floor(this.distance), energy: this.energy,
      health: this.health, shield: this.shield, speed: this.speed, speedRatio: this.speed / GAME_CONFIG.startSpeed, multiplier: this.multiplier,
      combo: this.combo, timeLeft: Math.ceil(this.timeLeft), elapsed: Math.floor(this.elapsed), avoided: this.avoided,
      missions: this.missions.map((mission) => ({ ...mission })), completedMissions: this.completedMissions,
      activePower: this.shield ? 'shield' : active, powerRemaining, district: DISTRICTS[this.lastDistrict]?.name || 'CITY ENTRY'
    };
  }

  project(z) {
    const t = clamp(1 - z / GAME_CONFIG.worldDepth, 0, 1.08);
    const eased = Math.pow(t, 1.65);
    const horizon = this.height * .285;
    const ground = this.height * .96;
    const y = horizon + eased * (ground - horizon);
    const scale = .22 + eased * 1.22;
    return { t, y, scale };
  }

  laneX(lane, t) {
    const spread = this.width * (.105 + clamp(t, 0, 1) * .235);
    return this.width / 2 + (lane - 1) * spread;
  }

  drawBackground(ctx) {
    const w = this.width, h = this.height;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#11132e'); sky.addColorStop(.38, '#171735'); sky.addColorStop(.72, '#0b1020'); sky.addColorStop(1, '#060914');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .5, h * .32, 5, w * .5, h * .32, w * .55);
    glow.addColorStop(0, 'rgba(127,76,210,.24)'); glow.addColorStop(.55, 'rgba(50,110,175,.06)'); glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h * .72);
    for (const star of this.stars) {
      const twinkle = .5 + Math.sin(this.elapsed * 1.4 + star.phase) * .25;
      ctx.globalAlpha = star.a * twinkle;
      ctx.fillStyle = '#bdefff'; ctx.beginPath(); ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.drawCity(ctx);
    this.drawRoad(ctx);
  }

  drawCity(ctx) {
    const w = this.width, h = this.height;
    const horizon = h * .29;
    for (const building of this.buildings) {
      const xBase = building.side < 0 ? 0 : w * .77;
      const available = w * .25;
      const drift = (this.bgOffset * building.speed * 18) % (h * .18);
      const x = xBase + building.x * available;
      const bw = Math.max(12, building.width * (w / 900));
      const bh = h * building.height;
      const y = horizon - bh + drift;
      const gradient = ctx.createLinearGradient(x, y, x + bw, y + bh);
      gradient.addColorStop(0, '#151a39'); gradient.addColorStop(1, '#0a1022');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = 'rgba(77,179,220,.21)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, bw - 1, bh - 1);
      const rows = Math.max(2, Math.floor(bh / 18));
      const cols = Math.max(1, Math.floor(bw / 13));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (((r * 7 + c * 3 + Math.floor(building.seed * 10)) % 5) < 2) {
          ctx.fillStyle = (r + c) % 4 === 0 ? 'rgba(255,91,214,.55)' : 'rgba(53,231,245,.5)';
          ctx.fillRect(x + 5 + c * 13, y + 8 + r * 17, Math.max(2, bw / 25), 4);
        }
      }
      ctx.fillStyle = 'rgba(53,231,245,.17)'; ctx.fillRect(x + bw * .47, y + 3, 1, bh - 6);
    }
    // Distant skyline silhouettes provide a stable horizon.
    ctx.fillStyle = 'rgba(17,23,48,.8)';
    for (let i = 0; i < 15; i++) {
      const bx = (i / 15) * w;
      const bw = w / 18;
      const bh = h * (.07 + ((i * 17) % 8) * .018);
      ctx.fillRect(bx, horizon - bh, bw, bh);
    }
    ctx.strokeStyle = 'rgba(53,231,245,.23)'; ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke();
  }

  drawRoad(ctx) {
    const w = this.width, h = this.height;
    const horizon = h * .285;
    const topHalf = w * .085;
    const bottomHalf = w * .47;
    ctx.beginPath(); ctx.moveTo(w / 2 - topHalf, horizon); ctx.lineTo(w / 2 + topHalf, horizon); ctx.lineTo(w / 2 + bottomHalf, h * 1.04); ctx.lineTo(w / 2 - bottomHalf, h * 1.04); ctx.closePath();
    const roadGradient = ctx.createLinearGradient(0, horizon, 0, h);
    roadGradient.addColorStop(0, '#18233c'); roadGradient.addColorStop(.5, '#111a30'); roadGradient.addColorStop(1, '#080d1b');
    ctx.fillStyle = roadGradient; ctx.fill();
    ctx.save(); ctx.clip();
    const pulse = .65 + Math.sin(this.elapsed * 3) * .15;
    ctx.strokeStyle = `rgba(53,231,245,${pulse * .16})`; ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const z = (i * 8 + (this.bgOffset * 22) % 8);
      const p = this.project(GAME_CONFIG.worldDepth - z);
      ctx.beginPath(); ctx.moveTo(w / 2 - bottomHalf, p.y); ctx.lineTo(w / 2 + bottomHalf, p.y); ctx.stroke();
    }
    for (const divider of [.333, .666]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + (divider - .5) * topHalf * 2, horizon);
      ctx.lineTo(w / 2 + (divider - .5) * bottomHalf * 2, h * 1.03);
      ctx.setLineDash([12, 18]); ctx.lineDashOffset = -this.bgOffset * 18;
      ctx.strokeStyle = 'rgba(143,177,221,.26)'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
    }
    // Neon edges and speed streaks.
    ctx.beginPath(); ctx.moveTo(w / 2 - topHalf, horizon); ctx.lineTo(w / 2 - bottomHalf, h * 1.03);
    ctx.moveTo(w / 2 + topHalf, horizon); ctx.lineTo(w / 2 + bottomHalf, h * 1.03);
    ctx.strokeStyle = 'rgba(53,231,245,.62)'; ctx.lineWidth = Math.max(1, w / 650); ctx.shadowColor = '#35e7f5'; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
    const floorGlow = ctx.createLinearGradient(0, h * .7, 0, h);
    floorGlow.addColorStop(0, 'transparent'); floorGlow.addColorStop(1, 'rgba(26,88,119,.12)');
    ctx.fillStyle = floorGlow; ctx.fillRect(0, h * .7, w, h * .3);
  }

  drawObjects(ctx) {
    const visible = this.objects.filter((object) => object.z <= GAME_CONFIG.worldDepth + 12 && object.z >= 0).sort((a, b) => b.z - a.z);
    for (const object of visible) {
      const projection = this.project(object.z);
      const x = this.laneX(object.lane, projection.t);
      if (object.kind === 'crystal' && !object.collected) this.drawCrystal(ctx, x, projection.y, projection.scale, object.seed);
      if (object.kind === 'power' && !object.collected) this.drawPower(ctx, x, projection.y, projection.scale, object.type);
      if (object.kind === 'obstacle' && !object.resolved) this.drawObstacle(ctx, x, projection.y, projection.scale, object.type, object.seed);
    }
  }

  drawCrystal(ctx, x, y, scale, seed) {
    const size = 9 * scale;
    const bob = Math.sin(this.elapsed * 5 + seed * 10) * 3 * scale;
    ctx.save(); ctx.translate(x, y - 17 * scale + bob); ctx.rotate(Math.sin(this.elapsed * 1.6 + seed) * .18);
    ctx.shadowColor = '#43f4f5'; ctx.shadowBlur = 17 * scale;
    const gradient = ctx.createLinearGradient(-size, -size, size, size);
    gradient.addColorStop(0, '#eaffff'); gradient.addColorStop(.4, '#3df2ee'); gradient.addColorStop(1, '#8471ff');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(0, -size * 1.55); ctx.lineTo(size, -size * .2); ctx.lineTo(size * .55, size * 1.35); ctx.lineTo(-size * .55, size * 1.35); ctx.lineTo(-size, -size * .2); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(.5, scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -size * 1.4); ctx.lineTo(0, size * 1.2); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke();
    ctx.restore();
  }

  drawPower(ctx, x, y, scale, type) {
    const size = 14 * scale;
    const colors = { shield: '#42e9f4', magnet: '#ad8cff', overdrive: '#ffb15c', phase: '#ff6edb' };
    const color = colors[type] || '#fff';
    const bob = Math.sin(this.elapsed * 4) * 4 * scale;
    ctx.save(); ctx.translate(x, y - 20 * scale + bob); ctx.rotate(this.elapsed * .6);
    ctx.shadowColor = color; ctx.shadowBlur = 20 * scale;
    ctx.strokeStyle = color; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `${color}33`; ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(-this.elapsed * .6);
    ctx.fillStyle = color; ctx.font = `bold ${Math.max(9, 17 * scale)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(type === 'shield' ? '⬡' : type === 'magnet' ? '⌁' : type === 'overdrive' ? 'ϟ' : '◇', 0, 1);
    ctx.restore();
  }

  drawObstacle(ctx, x, y, scale, type, seed) {
    const width = 43 * scale;
    const height = 27 * scale;
    ctx.save();
    ctx.translate(x, y);
    if (type === 'barrier') {
      ctx.shadowColor = '#ff765f'; ctx.shadowBlur = 13 * scale;
      ctx.fillStyle = '#311e34'; ctx.strokeStyle = '#ff8d62'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.roundRect(-width * .58, -height, width * 1.16, height * .7, 4 * scale); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb06a'; ctx.fillRect(-width * .48, -height * .78, width * .96, 3 * scale);
      ctx.fillStyle = '#ff765f'; ctx.fillRect(-width * .45, -height * .2, 5 * scale, height * .2); ctx.fillRect(width * .35, -height * .2, 5 * scale, height * .2);
    } else if (type === 'laser') {
      ctx.shadowColor = '#ff55d8'; ctx.shadowBlur = 15 * scale;
      ctx.fillStyle = '#231c42'; ctx.strokeStyle = '#e875ff'; ctx.lineWidth = 2 * scale;
      ctx.fillRect(-width * .64, -height * 2.15, width * 1.28, height * 2.1); ctx.strokeRect(-width * .64, -height * 2.15, width * 1.28, height * 2.1);
      ctx.fillStyle = '#ff58d7'; ctx.fillRect(-width * .72, -height * 1.35, width * 1.44, 3.5 * scale);
      ctx.fillStyle = '#ffb0ed'; ctx.fillRect(-width * .56, -height * 1.37, width * 1.12, 1.2 * scale);
    } else if (type === 'drone') {
      const bob = Math.sin(this.elapsed * 4 + seed * 8) * 4 * scale;
      ctx.translate(0, -height * 1.35 + bob);
      ctx.shadowColor = '#ff4f76'; ctx.shadowBlur = 13 * scale;
      ctx.fillStyle = '#28334d'; ctx.strokeStyle = '#8c9bbd'; ctx.lineWidth = 1.2 * scale;
      ctx.beginPath(); ctx.ellipse(0, 0, width * .52, height * .48, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff5478'; ctx.beginPath(); ctx.ellipse(0, 0, width * .22, height * .15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff587d'; ctx.beginPath(); ctx.moveTo(-width * .4, -height * .3); ctx.lineTo(-width * .75, -height * .7); ctx.moveTo(width * .4, -height * .3); ctx.lineTo(width * .75, -height * .7); ctx.stroke();
    } else if (type === 'wall') {
      ctx.shadowColor = '#ff9e4d'; ctx.shadowBlur = 13 * scale;
      ctx.fillStyle = '#33263a'; ctx.strokeStyle = '#ffad61'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.moveTo(-width * .52, 0); ctx.lineTo(-width * .42, -height * 2.2); ctx.lineTo(width * .42, -height * 2.2); ctx.lineTo(width * .52, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffcf82'; ctx.lineWidth = 1.2 * scale; ctx.beginPath(); ctx.moveTo(-width * .3, -height * 1.8); ctx.lineTo(width * .3, -height * 1.8); ctx.stroke();
    } else if (type === 'electric') {
      ctx.shadowColor = '#f5d45f'; ctx.shadowBlur = 16 * scale;
      ctx.fillStyle = '#252b3d'; ctx.strokeStyle = '#edcf5e'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.moveTo(-width * .55, 0); ctx.lineTo(-width * .4, -height * .72); ctx.lineTo(-width * .1, -height * .92); ctx.lineTo(width * .43, -height * .55); ctx.lineTo(width * .55, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff2a2'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(0, -height * .85); ctx.lineTo(-width * .11, -height * .46); ctx.lineTo(width * .05, -height * .5); ctx.lineTo(-width * .1, -height * .12); ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const w = this.width, h = this.height;
    const lane = this.player.laneVisual;
    const x = this.laneX(lane, .9);
    const jumpProgress = this.player.jumpTime > 0 ? 1 - this.player.jumpTime / GAME_CONFIG.jumpDuration : 0;
    const jumpLift = this.player.jumpTime > 0 ? Math.sin(jumpProgress * Math.PI) * h * .15 : 0;
    const slide = this.player.slideTime > 0;
    const baseY = h * .835;
    const y = baseY - jumpLift;
    const scale = clamp(w / 700, .65, 1.35);
    const blink = this.player.invulnerable > 0 && Math.floor(this.elapsed * 18) % 2 === 0;
    if (blink) ctx.globalAlpha = .42;
    // board shadow remains on the road during a jump
    ctx.save(); ctx.translate(x, baseY + 17 * scale); ctx.scale(slide ? 1.15 : 1, slide ? .7 : 1);
    ctx.fillStyle = `rgba(0,0,0,${this.player.jumpTime > 0 ? .2 : .42})`; ctx.beginPath(); ctx.ellipse(0, 0, 35 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.player.tilt * .12);
    if (this.shield || this.phaseTime > 0) {
      const shieldColor = this.shield ? '#46eff7' : '#bc7cff';
      ctx.strokeStyle = shieldColor; ctx.globalAlpha = .55 + Math.sin(this.elapsed * 8) * .18; ctx.lineWidth = 2 * scale; ctx.shadowColor = shieldColor; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.ellipse(0, -22 * scale, 34 * scale, 52 * scale, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = blink ? .42 : 1;
    }
    const boardY = 28 * scale;
    ctx.shadowColor = '#3cebf5'; ctx.shadowBlur = 17 * scale;
    const boardGrad = ctx.createLinearGradient(-34 * scale, boardY, 34 * scale, boardY);
    boardGrad.addColorStop(0, '#223455'); boardGrad.addColorStop(.4, '#67f9f3'); boardGrad.addColorStop(.7, '#987cff'); boardGrad.addColorStop(1, '#1a2a49');
    ctx.fillStyle = boardGrad; ctx.beginPath(); ctx.moveTo(-34 * scale, boardY); ctx.quadraticCurveTo(0, boardY - 8 * scale, 34 * scale, boardY); ctx.quadraticCurveTo(0, boardY + 10 * scale, -34 * scale, boardY); ctx.fill();
    ctx.shadowBlur = 0;
    if (slide) {
      ctx.rotate(-.22);
      ctx.fillStyle = '#1b2944'; ctx.strokeStyle = 'rgba(71,235,245,.75)'; ctx.lineWidth = 1.5 * scale;
      ctx.beginPath(); ctx.roundRect(-18 * scale, -13 * scale, 37 * scale, 20 * scale, 7 * scale); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#56647d'; ctx.beginPath(); ctx.arc(11 * scale, -19 * scale, 8 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#45e8f0'; ctx.fillRect(7 * scale, -21 * scale, 8 * scale, 3 * scale);
      ctx.strokeStyle = '#71829d'; ctx.lineWidth = 5 * scale; ctx.beginPath(); ctx.moveTo(-8 * scale, 0); ctx.lineTo(-17 * scale, 12 * scale); ctx.moveTo(8 * scale, 0); ctx.lineTo(20 * scale, 10 * scale); ctx.stroke();
    } else {
      // legs
      ctx.strokeStyle = '#263956'; ctx.lineWidth = 8 * scale; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-7 * scale, 8 * scale); ctx.lineTo(-15 * scale, 25 * scale); ctx.moveTo(8 * scale, 8 * scale); ctx.lineTo(16 * scale, 24 * scale); ctx.stroke();
      ctx.strokeStyle = '#48dce9'; ctx.lineWidth = 2 * scale; ctx.beginPath(); ctx.moveTo(-15 * scale, 25 * scale); ctx.lineTo(-7 * scale, 27 * scale); ctx.moveTo(16 * scale, 24 * scale); ctx.lineTo(24 * scale, 26 * scale); ctx.stroke();
      // torso
      const jacket = ctx.createLinearGradient(-16 * scale, -38 * scale, 17 * scale, 2 * scale);
      jacket.addColorStop(0, '#465a78'); jacket.addColorStop(.5, '#1d2d4a'); jacket.addColorStop(1, '#111c32');
      ctx.fillStyle = jacket; ctx.strokeStyle = 'rgba(70,234,244,.75)'; ctx.lineWidth = 1.2 * scale;
      ctx.beginPath(); ctx.roundRect(-15 * scale, -42 * scale, 30 * scale, 47 * scale, 9 * scale); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#48e8ef'; ctx.shadowColor = '#48e8ef'; ctx.shadowBlur = 8 * scale; ctx.fillRect(1 * scale, -32 * scale, 3 * scale, 22 * scale); ctx.shadowBlur = 0;
      // backpack
      ctx.fillStyle = '#293a5d'; ctx.strokeStyle = '#927bff'; ctx.lineWidth = 1.2 * scale; ctx.beginPath(); ctx.roundRect(10 * scale, -38 * scale, 13 * scale, 29 * scale, 4 * scale); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a58aff'; ctx.fillRect(19 * scale, -32 * scale, 2 * scale, 17 * scale);
      // arms
      ctx.strokeStyle = '#354966'; ctx.lineWidth = 6 * scale; ctx.beginPath(); ctx.moveTo(-12 * scale, -34 * scale); ctx.lineTo(-23 * scale, -17 * scale); ctx.moveTo(12 * scale, -34 * scale); ctx.lineTo(22 * scale, -16 * scale); ctx.stroke();
      // helmet and visor
      ctx.fillStyle = '#6d7f9b'; ctx.strokeStyle = '#8cebf0'; ctx.lineWidth = 1.4 * scale; ctx.beginPath(); ctx.ellipse(0, -53 * scale, 13 * scale, 15 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#152642'; ctx.beginPath(); ctx.roundRect(-11 * scale, -57 * scale, 22 * scale, 7 * scale, 3 * scale); ctx.fill();
      ctx.fillStyle = '#4ff6f3'; ctx.shadowColor = '#4ff6f3'; ctx.shadowBlur = 10 * scale; ctx.fillRect(-9 * scale, -55 * scale, 18 * scale, 3 * scale); ctx.shadowBlur = 0;
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  drawSpeedLines(ctx) {
    if (this.speed < 32) return;
    const alpha = (this.speed - 32) / 90;
    ctx.save(); ctx.strokeStyle = `rgba(117,226,255,${alpha})`; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 83 + this.elapsed * 210) % (this.width + 80)) - 40;
      const y = (i * 67 + this.elapsed * 390) % (this.height * .72);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 20 + this.speed); ctx.stroke();
    }
    ctx.restore();
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    ctx.save();
    this.drawBackground(ctx);
    this.drawSpeedLines(ctx);
    this.drawObjects(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);
    if (this.player.hitTime > 0) {
      ctx.fillStyle = `rgba(255,55,100,${this.player.hitTime * .2})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.toastClock > 0 && this.toastText) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.toastClock * 2);
      ctx.fillStyle = 'rgba(5,12,25,.55)'; ctx.fillRect(this.width * .25, this.height * .48, this.width * .5, 38);
      ctx.font = `900 ${Math.max(12, this.width * .022)}px Arial`; ctx.textAlign = 'center'; ctx.fillStyle = '#efffff'; ctx.shadowColor = '#35e7f5'; ctx.shadowBlur = 13;
      ctx.fillText(this.toastText, this.width / 2, this.height * .48 + 25); ctx.restore();
    }
    if (this.mode === 'time' && this.state === 'running') {
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(this.timeLeft)}s`, this.width / 2, this.height * .22);
    }
    ctx.restore();
  }
}
