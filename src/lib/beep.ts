const audioCtx = new AudioContext();

const beep = (
  duration: number = 500,
  frequency = 440,
  volume = 1,
  type: OscillatorType = 'sine',
) => {
  var oscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (volume) {
    gainNode.gain.value = volume;
  }

  if (frequency) {
    oscillator.frequency.value = frequency;
  }

  if (type) {
    oscillator.type = type;
  }

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + duration / 1000);
};

export default beep;
