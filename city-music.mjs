const beat = 60 / 77;
const chords = [[45,52,56,59,64],[42,49,52,56,61],[38,45,49,52,54],[40,47,50,56,59],[45,52,54,59,61],[47,54,57,61,64],[38,45,52,54,57],[40,47,54,57,59]];
const melody = [
  [[0,76],[1.5,73],[2.5,71],[3.5,69]], [[.5,73],[2,76],[3,78]], [[0,76],[2,73],[3,71]], [[.5,68],[1.5,71],[3,73]],
  [[0,76],[.75,76],[1.5,76],[2.5,81],[3.5,78]], [[0,76],[2,73],[3,74]], [[.5,73],[2,69],[3,71]], [[0,68],[2,69],[3.5,73]],
];
const frequency = note => 440 * 2 ** ((note - 69) / 12);

export function createScore() {
  let audio;
  let master;
  let rhythm;
  let send;
  let impulse;
  let waves;
  let timer;
  let next;
  let bar = 0;
  let volume = .3;
  let playing = false;
  const voices = new Set();

  function initialize() {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    audio = new Audio();
    master = audio.createGain();
    master.gain.value = 0;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -25;
    compressor.ratio.value = 2.5;
    master.connect(compressor).connect(audio.destination);
    rhythm = audio.createGain();
    rhythm.gain.value = .73;
    rhythm.connect(master);
    send = audio.createGain();
    send.gain.value = .23;
    const verb = audio.createConvolver();
    const n = Math.floor(audio.sampleRate * 2.6);
    const room = audio.createBuffer(2, n, audio.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = room.getChannelData(channel);
      for (let i = 0; i < n; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i/n) ** 3.6;
    }
    verb.buffer = room;
    const dark = audio.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3100;
    send.connect(verb).connect(dark).connect(master);
    impulse = audio.createBuffer(1, audio.sampleRate >> 2, audio.sampleRate);
    const noise = impulse.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = Math.random()*2 - 1;
    waves = {
      piano: audio.createPeriodicWave(Float32Array.of(0,1,.33,.16,.035,.02), new Float32Array(6)),
      strings: audio.createPeriodicWave(Float32Array.of(0,1,.44,.32,.22,.17,.12,.07), new Float32Array(8)),
    };
  }

  function hold(source, at, length) {
    voices.add(source);
    source.addEventListener('ended', () => voices.delete(source), { once: true });
    source.start(at);
    source.stop(at + length);
  }

  function tone(at, note, length, level, kind) {
    const voice = audio.createOscillator();
    const env = audio.createGain();
    const slow = kind === 'strings';
    if (waves[kind]) voice.setPeriodicWave(waves[kind]);
    else voice.type = 'sine';
    voice.frequency.value = frequency(note);
    if (slow) voice.detune.value = (note % 2 ? 1 : -1) * 4.5;
    env.gain.setValueAtTime(.0001, at);
    env.gain.exponentialRampToValueAtTime(level, at + (slow ? .72 : .027));
    if (slow) env.gain.linearRampToValueAtTime(level * .72, at + length - .4);
    env.gain.exponentialRampToValueAtTime(.0001, at + length);
    voice.connect(env);
    env.connect(master);
    if (kind !== 'bass') env.connect(send);
    hold(voice, at, length + .016);
  }

  function drums(at, low) {
    const env = audio.createGain();
    if (low) {
      const kick = audio.createOscillator();
      kick.frequency.setValueAtTime(78, at);
      kick.frequency.exponentialRampToValueAtTime(37, at + .17);
      env.gain.setValueAtTime(.0001, at);
      env.gain.exponentialRampToValueAtTime(.16, at + .019);
      env.gain.exponentialRampToValueAtTime(.0001, at + .38);
      kick.connect(env).connect(rhythm);
      hold(kick, at, .40);
    } else {
      const brush = audio.createBufferSource();
      brush.buffer = impulse;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 860;
      filter.Q.value = .66;
      env.gain.setValueAtTime(.057, at);
      env.gain.exponentialRampToValueAtTime(.0001, at + .19);
      brush.connect(filter).connect(env).connect(rhythm);
      hold(brush, at, .20);
    }
  }

  function sequence(at, index) {
    const chord = chords[index];
    chord.slice(1).forEach((note, i) => tone(at + i*.084, note + (i % 3 === 0 ? 12 : 0), 4.64*beat, .018, 'strings'));
    tone(at, chord[0]-12, 1.7*beat, .075, 'bass');
    tone(at + 2.5*beat, chord[1]-12, 1.32*beat, .050, 'bass');
    for (const [step, note] of melody[index]) {
      tone(at + step*beat, note, 1.48, .097, 'piano');
      if (step === 0 || step === 3.5) tone(at + step*beat, note + 12, 1.06, .016, 'bell');
    }
    drums(at, true);
    drums(at + 1.28*beat, false);
    drums(at + 2.65*beat, true);
    drums(at + 3.23*beat, false);
  }

  function schedule() {
    if (!playing) return;
    if (next < audio.currentTime) next = audio.currentTime + .07;
    while (next < audio.currentTime + 4.15) {
      sequence(next, bar++ % chords.length);
      next += 4 * beat;
    }
  }

  function setVolume(value) {
    volume = value;
    if (master && playing) master.gain.setTargetAtTime(volume*.73, audio.currentTime, .08);
  }
  function stop() {
    playing = false;
    clearInterval(timer);
    if (!audio) return;
    master.gain.setTargetAtTime(0, audio.currentTime, .05);
    for (const source of voices) {
      try { source.stop(audio.currentTime + .21); } catch {}
    }
  }

  async function start() {
    if (!audio) initialize();
    await audio.resume();
    if (playing) return;
    playing = true;
    next = audio.currentTime + .095;
    setVolume(volume);
    schedule();
    timer = setInterval(schedule, 270);
  }

  return { start, stop, setVolume };
}
