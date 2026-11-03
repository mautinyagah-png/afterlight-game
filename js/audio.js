
export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.musicEnabled = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensureContext() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.22 : 0;
      this.master.connect(this.context.destination);
      return true;
    } catch {
      this.context = null;
      return false;
    }
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (this.ensureContext() && this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.22 : 0, this.context.currentTime, 0.04);
    }
    if (!this.enabled) this.stopMusic();
  }

  setMusicEnabled(value) {
    this.musicEnabled = Boolean(value);
    if (this.musicEnabled && this.enabled) this.startMusic();
    else this.stopMusic();
  }

  tone(frequency, duration = 0.12, type = 'sine', volume = 0.3, slideTo = null, delay = 0) {
    if (!this.enabled || !this.ensureContext() || !this.master) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(30, frequency), now);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.025);
  }

  noise(duration = 0.14, volume = 0.12, filterFrequency = 900) {
    if (!this.enabled || !this.ensureContext() || !this.master) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  play(name) {
    if (!this.enabled) return;
    switch (name) {
      case 'click': this.tone(520, .055, 'triangle', .13, 720); break;
      case 'start': this.tone(280, .12, 'sawtooth', .16, 540); this.tone(540, .18, 'sine', .16, 820, .09); break;
      case 'collect': this.tone(690, .08, 'sine', .14, 980); this.tone(980, .12, 'triangle', .1, 1280, .045); break;
      case 'jump': this.tone(230, .16, 'triangle', .13, 510); break;
      case 'slide': this.noise(.13, .08, 650); this.tone(180, .12, 'sine', .08, 110); break;
      case 'hit': this.noise(.24, .2, 500); this.tone(145, .22, 'sawtooth', .18, 55); break;
      case 'shield': this.tone(360, .18, 'triangle', .17, 850); this.tone(850, .2, 'sine', .14, 1180, .08); break;
      case 'power': this.tone(330, .13, 'sine', .15, 660); this.tone(660, .18, 'triangle', .15, 990, .1); break;
      case 'mission': this.tone(520, .1, 'triangle', .16, 780); this.tone(780, .13, 'triangle', .16, 1040, .11); this.tone(1040, .18, 'sine', .14, 1380, .22); break;
      case 'combo': this.tone(570, .08, 'triangle', .12, 830); break;
      case 'gameover': this.tone(290, .23, 'sawtooth', .15, 160); this.tone(160, .35, 'sine', .13, 70, .2); break;
      case 'pause': this.tone(400, .07, 'sine', .1, 280); break;
      case 'district': this.tone(310, .12, 'sine', .1, 620); this.tone(620, .17, 'triangle', .12, 900, .12); break;
      default: break;
    }
  }

  startMusic() {
    if (!this.musicEnabled || !this.enabled || this.musicTimer) return;
    if (!this.ensureContext()) return;
    const notes = [110, 164.81, 130.81, 196, 146.83, 220, 130.81, 174.61];
    this.musicTimer = window.setInterval(() => {
      if (!this.musicEnabled || !this.enabled) return;
      const note = notes[this.musicStep % notes.length];
      this.tone(note, .32, 'triangle', .035, note * 1.01);
      if (this.musicStep % 4 === 0) this.tone(note * 2, .12, 'sine', .018, note * 2.1, .08);
      this.musicStep++;
    }, 420);
  }

  stopMusic() {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
