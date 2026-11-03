
export const GAME_CONFIG = Object.freeze({
  lanes: 3,
  maxHealth: 3,
  worldDepth: 110,
  playerDepth: 7,
  startSpeed: 24,
  maxSpeed: 43,
  speedIncrease: 0.55,
  distanceRate: 1.45,
  obstacleSpawnMin: 1.05,
  obstacleSpawnMax: 1.5,
  crystalSpawnMin: 0.45,
  crystalSpawnMax: 0.85,
  powerSpawnMin: 10,
  powerSpawnMax: 15,
  invulnerabilityTime: 0.95,
  jumpDuration: 0.72,
  slideDuration: 0.62,
  timeAttackSeconds: 60,
  maxParticles: 90,
  scorePerSecond: 8,
  crystalScore: 10,
  obstacleBonus: 25,
  powerScore: 50,
  missionBonus: 150
});

export const OBSTACLE_TYPES = Object.freeze(['barrier', 'laser', 'drone', 'wall', 'electric']);
export const POWER_TYPES = Object.freeze(['shield', 'magnet', 'overdrive', 'phase']);

export const POWER_INFO = Object.freeze({
  shield: { name: 'ENERGY SHIELD', duration: '1 HIT', seconds: 0, color: '#42e9f4' },
  magnet: { name: 'CORE MAGNET', duration: '7 SEC', seconds: 7, color: '#a88aff' },
  overdrive: { name: 'OVERDRIVE', duration: '6 SEC', seconds: 6, color: '#ffb45f' },
  phase: { name: 'PHASE MODE', duration: '3.5 SEC', seconds: 3.5, color: '#ff76db' }
});

export const DISTRICTS = [
  { name: 'CITY ENTRY', at: 0, tip: 'Stay flexible. The safest lane can change in a heartbeat.' },
  { name: 'NEON DISTRICT', at: 350, tip: 'Crystal trails often point toward a safer route. Keep your eyes ahead.' },
  { name: 'INDUSTRIAL ZONE', at: 850, tip: 'Laser gates need a slide. Road barriers need a jump. Read the shape.' },
  { name: 'DARK SECTOR', at: 1500, tip: 'Speed is rising. Make your lane choices early, not at the last second.' },
  { name: 'THE CORE', at: 2400, tip: 'You are deep in the city now. Use your power-ups before you need them.' }
];

export const MISSION_POOL = [
  { id: 'crystals', title: 'Collect 12 energy cores', short: 'Collect 12 cores', target: 12, unit: 'cores', reward: 150 },
  { id: 'jump', title: 'Jump over 3 barriers', short: 'Jump 3 barriers', target: 3, unit: 'jumps', reward: 150 },
  { id: 'slide', title: 'Slide under 3 laser gates', short: 'Slide 3 laser gates', target: 3, unit: 'slides', reward: 150 },
  { id: 'survive', title: 'Survive for 35 seconds', short: 'Survive 35 seconds', target: 35, unit: 'seconds', reward: 180 },
  { id: 'distance', title: 'Travel 600 meters', short: 'Travel 600 meters', target: 600, unit: 'meters', reward: 180 },
  { id: 'power', title: 'Collect 2 power-ups', short: 'Collect 2 power-ups', target: 2, unit: 'boosts', reward: 150 }
];
