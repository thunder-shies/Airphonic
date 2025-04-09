
// ===== CONFIGURATION =====
const CONFIG = {
  // Audio settings
  bufferSize: 512,
  fftSmoothing: 0.9,
  ampSmoothing: 0.9,
  bgmVolume: 0.5,
  minVolume: 0,
  maxVolume: 1,

  // Mountain visualization
  mountainSensitivity: 1,
  mountainStepSize: 2,
  frameInterval: 3,

  // Circular visualization
  historyLayers: 40,
  spectrumRange: 0.2,
  brightnessMult: 2,
  spacingFactor: 2,

  // Particles
  maxParticles: 1000,
  highEnergyThreshold: 230,

  // Colors (HSB format)
  colors: {
    primary: [120, 100, 45], // Green
    accent: [200, 0, 60], // Blue-ish for particles
  },
};

// ===== STATE VARIABLES =====
// App state
let started = false;
let audioStarted = false;
let isAudioLoading = false;
let currentCity = "None";
let lastProcessedData = null;

// Audio components
let song;
let fft, analyzer, audioContext, analyserNode;
let frequencies = [];
let avgAmplitude = 0;
let spectrumHist = [];
let packedData = {};

// Assets files
let nullBGM, hkgBGM, bkkBGM;
let fontRegular;

// Visualization state
let particles = [];
let wavePos = 512;
let horizScale;

// Graphics buffers
let canvasHist, mountainBuffer, circularBuffer;

// ===== CORE P5 FUNCTIONS =====
function preload() {
  nullBGM = loadSound("assets/audio/silence.mp3");
  hkgBGM = loadSound("assets/audio/bgmHKG.mp3");
  bkkBGM = loadSound("assets/audio/bgmBKK.wav");
  // fontRegular = loadFont("assets/font/Blanka-Regular.otf");
  fontRegular = loadFont("assets/font/RubikGlitch-Regular.ttf");
}

function setup() {
  setupCanvas();
  setupBuffers();
  setupAudio();
  setupMessageListener();
  started = true;
}

function draw() {
  background(0);

  if (!audioStarted) {
    displayStartAudioPrompt();
    return;
  }

  if (isAudioLoading) {
    displayLoadingScreen();
    return;
  }

  processPackedData();
  updateAudioData();

  // Draw visualizations
  drawMountainVis();
  drawCircularVis();


  // Display both visualizations
  image(mountainBuffer, 0, 0);
  image(circularBuffer, 0, 0);

  // Display air quality information
  const pollutants = {
    "CO": 0,
    "O₃": 0,
    "NO₂": 0,
    "SO₂": 0,
    "PM₂.₅": 0,
    "PM₁₀": 0
  };

  displayAirInfo(pollutants);
}

// ===== SETUP FUNCTIONS =====
function setupCanvas() {
  const canvasDiv = document.getElementById("p5Canvas");
  const width = canvasDiv.offsetWidth;
  const height = canvasDiv.offsetHeight;

  const sketchCanvas = createCanvas(width, height);
  sketchCanvas.parent("p5Canvas");

  pixelDensity(1);
  angleMode(DEGREES);
  rectMode(CENTER);
  colorMode(HSB);
  background(0);

  horizScale = width / CONFIG.bufferSize;
}

function setupBuffers() {
  // Create graphics buffers
  canvasHist = createGraphics(width, height);
  canvasHist.background(0);

  mountainBuffer = createGraphics(width, height);
  mountainBuffer.background(0, 0);

  circularBuffer = createGraphics(width, height);
  circularBuffer.background(0, 0);
  circularBuffer.angleMode(DEGREES);
  circularBuffer.colorMode(HSB);
}

function setupAudio() {
  fft = new p5.FFT(CONFIG.fftSmoothing, CONFIG.bufferSize);
  analyzer = new p5.Amplitude();
  audioContext = getAudioContext();

  // Add listeners for starting audio
  const canvas = document.getElementById("p5Canvas");
  canvas.addEventListener("click", startAudio, { once: true });
  canvas.addEventListener("touchstart", startAudio, { once: true });
}

function setupMessageListener() {
  registerServiceWorker('../service-worker.js');
  listenMessage(function (incomingData) {
    packedData = incomingData.message;
  });
}

function startAudio() {
  audioContext.resume().then(() => {
    // console.log("AudioContext resumed!");

    // Start with silent track
    song = nullBGM;

    if (song && song.isLoaded()) {
      initAudio();
      song.loop();
      song.setVolume(CONFIG.bgmVolume);
      audioStarted = true;
    } else {
      console.error("Initial BGM not loaded!");
    }
  }).catch(e => console.error("Error resuming AudioContext:", e));
}

// ===== AUDIO PROCESSING =====
function initAudio() {
  if (!song) {
    console.error("initAudio called but song is null!");
    return;
  }

  // Reset audio context if needed
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  // Set up analyzer if not already created
  if (!analyserNode) {
    analyserNode = audioContext.createAnalyser();
    analyserNode.smoothingTimeConstant = 0.3;
    analyserNode.fftSize = CONFIG.bufferSize * 2;
  }
  frequencies = new Uint8Array(analyserNode.frequencyBinCount);

  // Disconnect previous inputs
  fft.setInput();
  analyzer.setInput();

  // Connect the new song
  song.connect(p5.soundOut);
  song.connect(analyserNode);

  // Set inputs for p5 components
  fft.setInput(song);
  analyzer.setInput(song);

  console.log("Audio initialized for:", currentCity);
}

function updateAudioData() {
  if (analyserNode) {
    analyserNode.getByteTimeDomainData(frequencies);
  }

  const currentLevel = analyzer.getLevel();
  avgAmplitude = lerp(avgAmplitude, currentLevel, 1 - CONFIG.ampSmoothing);
}

function processPackedData() {
  // Skip if no data or unchanged data
  if (!packedData || Object.keys(packedData).length === 0) {
    return;
  }

  if (lastProcessedData && JSON.stringify(lastProcessedData) === JSON.stringify(packedData)) {
    return;
  }

  // console.log("Processing new packed data:", packedData);

  // Extract city information
  let newCity = null;
  let newVolume = null;

  // Check for city/location data using the new property name
  if (packedData.currentCity) {
    newCity = packedData.currentCity;
  } else if (packedData.city) {
    newCity = packedData.city;
  } else if (packedData.location) {
    newCity = packedData.location;
  } else if (packedData.audio) {
    newCity = packedData.audio;
  } else if (typeof packedData === 'string') {
    newCity = packedData;
  }

  // Check for volume data using the new property name
  if (packedData.bgmVolume !== undefined) {
    newVolume = parseFloat(packedData.bgmVolume);
  } else if (packedData.volume !== undefined) {
    newVolume = parseFloat(packedData.volume);
  } else if (packedData.volSlider !== undefined) {
    newVolume = parseFloat(packedData.volSlider);
  } else if (packedData.volumeLevel !== undefined) {
    newVolume = parseFloat(packedData.volumeLevel);
  }

  // Apply changes
  if (newCity) {
    handleCityChange(newCity);
  }

  if (newVolume !== null && !isNaN(newVolume)) {
    // Ensure volume is within valid range
    newVolume = constrain(newVolume, CONFIG.minVolume, CONFIG.maxVolume);
    updateVolume(newVolume);
  }

  // Check for pollutant data
  if (packedData.pollutants) {
    handlePollutantUpdate(packedData.pollutants);
  }

  // Save this data as processed
  lastProcessedData = JSON.parse(JSON.stringify(packedData));
}

async function handleCityChange(newCity) {
  console.log("Changing city to:", newCity);

  // Stop current song
  if (song && song.isLoaded()) {
    if (song.isPlaying()) {
      song.stop();
    }
    song.disconnect();
  }

  currentCity = newCity;

  // Select the new song
  switch (newCity) {
    case "HKG":
      song = hkgBGM;
      break;
    case "BKK":
      song = bkkBGM;
      break;
    default:
      song = nullBGM;
    // console.log("Using silent track for:", newCity);
  }

  // Play the new song if loaded
  if (song && song.isLoaded()) {
    initAudio();
    song.loop();
    song.setVolume(CONFIG.bgmVolume);
  } else {
    console.error("Selected song is not loaded:", newCity);
    // Fallback to silence
    if (nullBGM && nullBGM.isLoaded()) {
      song = nullBGM;
      initAudio();
      song.loop();
      song.setVolume(CONFIG.bgmVolume);
    }
  }
}

function updateVolume(newVolume) {
  // console.log("Updating volume to:", newVolume);

  // Update the config value
  CONFIG.bgmVolume = newVolume;

  // Apply to current song if playing
  if (song && song.isLoaded()) {
    song.setVolume(newVolume);
  }
}

function handlePollutantUpdate(pollutants) {
  console.log("Updating pollutants:", pollutants);

  // Process each pollutant
  for (const [name, data] of Object.entries(pollutants)) {
    // data.active is a boolean (true/false) indicating if the pollutant is enabled
    // data.level is a value between 0-1 indicating the intensity/volume

    if (data.active) {
      // Pollutant is active, use its level value
      // Example: Play or adjust volume of pollutant sound
      playPollutantSound(name, data.level);
    } else {
      // Pollutant is inactive
      // Example: Stop pollutant sound
      stopPollutantSound(name);
    }
  }

  function playPollutantSound(name, level) {
    // This is just an example - implement based on your audio setup
    console.log(`Playing ${name} at level ${level}`);

    // If you have sound objects for each pollutant, you could do:
    // if (pollutantSounds[name]) {
    //   pollutantSounds[name].setVolume(level);
    //   if (!pollutantSounds[name].isPlaying()) {
    //     pollutantSounds[name].loop();
    //   }
    // }
  }

  function stopPollutantSound(name) {
    // This is just an example - implement based on your audio setup
    console.log(`Stopping ${name}`);

    // if (pollutantSounds[name] && pollutantSounds[name].isPlaying()) {
    //   pollutantSounds[name].stop();
    // }
  }
}

// ===== MOUNTAIN VISUALIZATION =====
function drawMountainVis() {
  // Only update every few frames for performance
  if (frameCount % CONFIG.frameInterval !== 0) return;

  // Clear buffer and apply trail effect
  mountainBuffer.clear();

  if (frameCount > 6) {
    mountainBuffer.image(canvasHist, 0, -2);
  }

  // Draw mountain wave
  mountainBuffer.push();
  mountainBuffer.colorMode(RGB);
  drawMountainWaveAndOutline(mountainBuffer);
  mountainBuffer.pop();

  // Save current state for trail effect
  canvasHist = mountainBuffer.get();

  // Move wave position downward
  if (wavePos < height - 300) {
    wavePos += 2;
  }
}

function drawMountainWaveAndOutline(buffer) {
  // Draw filled waveform
  buffer.fill(0, 0, 0, 150);
  buffer.noStroke();
  buffer.beginShape();

  // Start point
  buffer.vertex(0, wavePos + frequencies[0] * CONFIG.mountainSensitivity);

  // Draw points along the wave
  for (let i = CONFIG.mountainStepSize; i < CONFIG.bufferSize; i += CONFIG.mountainStepSize) {
    buffer.vertex(
      i * horizScale,
      wavePos + frequencies[i] * CONFIG.mountainSensitivity
    );
  }

  // Complete the shape
  buffer.vertex(width, wavePos + 400);
  buffer.vertex(0, wavePos + 400);
  buffer.endShape(CLOSE);

  // Draw wave outline
  buffer.stroke(255, 255, 255, 40);
  buffer.strokeWeight(2);
  buffer.noFill();

  for (let i = CONFIG.mountainStepSize; i < CONFIG.bufferSize - CONFIG.mountainStepSize; i += CONFIG.mountainStepSize) {
    const x1 = i * horizScale;
    const y1 = wavePos + frequencies[i] * CONFIG.mountainSensitivity;
    const x2 = (i + CONFIG.mountainStepSize) * horizScale;
    const y2 = wavePos + frequencies[i + CONFIG.mountainStepSize] * CONFIG.mountainSensitivity;

    buffer.line(x1, y1, x2, y2);
  }
}

// ===== CIRCULAR VISUALIZATION =====
function drawCircularVis() {
  circularBuffer.clear();

  const spectrum = fft.analyze();
  const bassEnergy = fft.getEnergy(20, 200);
  const isHighEnergy = bassEnergy > CONFIG.highEnergyThreshold;

  circularBuffer.push();
  circularBuffer.translate(width / 2, height / 2);

  drawSpectrumHistory(circularBuffer, spectrum);
  drawCenterCircle(circularBuffer);
  updateAndDrawParticles(circularBuffer, isHighEnergy);

  circularBuffer.pop();
}

function drawSpectrumHistory(buffer, spectrum) {
  buffer.blendMode(ADD);

  // Add current spectrum to history
  const currentLayer = calculateSpectrumLayer(spectrum);
  spectrumHist.unshift(currentLayer);

  if (spectrumHist.length > CONFIG.historyLayers) {
    spectrumHist.pop();
  }

  // Draw all layers
  const numBands = spectrum.length * CONFIG.spectrumRange;
  buffer.strokeWeight(2);

  for (let i = 0; i < spectrumHist.length; i++) {
    drawSpectrumLayer(buffer, spectrumHist[i], i, numBands);
  }

  buffer.blendMode(BLEND);
}

function calculateSpectrumLayer(spectrum) {
  const numBands = spectrum.length * CONFIG.spectrumRange;
  const layer = [];

  for (let i = 0; i < numBands; i++) {
    const factor = i / numBands;
    const nextBand = Math.min(int(numBands) + i, spectrum.length - 1);
    const value = spectrum[i] * factor + spectrum[nextBand] * (1 - factor);
    layer[i] = map(value, 0, 255, 50, height / 2.5);
  }

  return layer;
}

function drawSpectrumLayer(buffer, layer, index, numBands) {
  // Calculate visual properties
  const layerRatio = index / spectrumHist.length;
  const brightness = map(index, 0, spectrumHist.length, 255, 100);
  const alpha = map(index, 0, spectrumHist.length, 1, 0.3) * avgAmplitude * CONFIG.brightnessMult;
  const hue = CONFIG.colors.primary[0];
  const radiusMult = 1 + layerRatio * CONFIG.spacingFactor;

  // Set color
  buffer.stroke(hue, 255, brightness, alpha);

  // Only fill the newest layer
  if (index === 0) {
    buffer.fill(hue, 255, brightness, 0.2 * avgAmplitude * CONFIG.brightnessMult);
  } else {
    buffer.noFill();
  }

  // Draw the layer
  buffer.beginShape();

  for (let i = 0; i < numBands; i++) {
    const angle = 360 * (i / numBands);
    const radius = layer[i] * radiusMult;
    buffer.curveVertex(cos(angle) * radius, sin(angle) * radius);
  }

  // Close the shape
  const firstRadius = layer[0] * radiusMult;
  buffer.curveVertex(firstRadius, 0);
  buffer.endShape(CLOSE);
}

function drawCenterCircle(buffer) {
  buffer.fill(CONFIG.colors.primary);
  buffer.circle(0, 0, 80);
}

// ===== PARTICLE SYSTEM =====
function updateAndDrawParticles(buffer, isHighEnergy) {
  // Add new particles if conditions met
  if (song.isPlaying() && particles.length < CONFIG.maxParticles && mouseIsPressed) {
    particles.push(createParticle(isHighEnergy));
  }

  // Update and draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (isParticleOffscreen(p)) {
      particles.splice(i, 1);
      continue;
    }

    updateParticle(p, isHighEnergy);

    if (mouseIsPressed) {
      drawParticle(buffer, p);
    }
  }
}

function createParticle(isHighEnergy) {
  const pos = p5.Vector.random2D().mult(60);
  return {
    pos: pos,
    vel: createVector(0, 0),
    acc: pos.copy().mult(random(0.0001, 0.00001)),
    size: isHighEnergy ? random(5, 25) : random(3, 6),
    color: color(CONFIG.colors.accent[0], CONFIG.colors.accent[1], random(30, 80))
  };
}

function updateParticle(p, isHighEnergy) {
  p.vel.add(p.acc);
  p.pos.add(p.vel);

  if (isHighEnergy) {
    p.pos.add(p.vel.copy().mult(3));
  }
}

function drawParticle(buffer, p) {
  buffer.noStroke();
  buffer.fill(p.color);
  buffer.ellipse(p.pos.x, p.pos.y, p.size);
}

function isParticleOffscreen(p) {
  return (
    p.pos.x < -width / 2 ||
    p.pos.x > width / 2 ||
    p.pos.y < -height / 2 ||
    p.pos.y > height / 2
  );
}


// ===== EVENT LISTENERS =====
function displayAirInfo(pollutants) {
  push();
  textFont(fontRegular);
  fill(255);
  textSize(32); // Text size for pollutant names
  text(`AQI (US):`, 20, 60);

  // Display each pollutant with smaller text size for numbers
  let yOffset = 100; // Starting y position for pollutants
  for (let pollutant in pollutants) {
    let value = pollutants[pollutant];

    // Render pollutant name
    textSize(32); // Text size for pollutant names
    text(`${pollutant}: `, 20, yOffset);

    yOffset += 40; // Increment y position for the next pollutant
  }

  pop();
}


// ===== UTILITY FUNCTIONS =====
function displayLoadingScreen() {
  push();
  fill(255);
  textSize(32);
  textAlign(CENTER, CENTER);
  text("Loading audio...", width / 2, height / 2);
  pop();
}

function displayStartAudioPrompt() {
  push();
  fill(255);
  textSize(32);
  textAlign(CENTER, CENTER);
  text("Click anywhere to start", width / 2, height / 2);
  pop();
}

function togglePlayback() {
  if (song.isPlaying()) {
    song.pause();
    noLoop();
  } else {
    song.play();
    loop();
  }
}

// ===== WINDOW EVENTS =====
function windowResized() {
  // Store old state
  const oldBuffers = {
    canvasHist: canvasHist.get(),
    mountainBuffer: mountainBuffer.get(),
    circularBuffer: circularBuffer.get()
  };

  const oldDimensions = {
    width: width,
    height: height
  };

  // Resize canvas
  const canvasDiv = document.getElementById("p5Canvas");
  resizeCanvas(canvasDiv.offsetWidth, canvasDiv.offsetHeight);

  // Update scaling factor
  horizScale = width / CONFIG.bufferSize;

  // Recreate buffers at new size
  recreateBuffers(oldBuffers, oldDimensions);

  // Update elements that depend on dimensions
  scaleParticlePos(oldDimensions.width, oldDimensions.height);
  wavePos = (wavePos / oldDimensions.height) * height;
}

function recreateBuffers(oldBuffers, oldDimensions) {
  // Recreate all buffers
  canvasHist = createGraphics(width, height);
  canvasHist.background(0);

  mountainBuffer = createGraphics(width, height);
  mountainBuffer.background(0, 0);

  circularBuffer = createGraphics(width, height);
  circularBuffer.background(0, 0);
  circularBuffer.angleMode(DEGREES);
  circularBuffer.colorMode(HSB);

  // Restore content with scaling
  canvasHist.image(oldBuffers.canvasHist, 0, 0, width, height);
  mountainBuffer.image(oldBuffers.mountainBuffer, 0, 0, width, height);
  circularBuffer.image(oldBuffers.circularBuffer, 0, 0, width, height);
}

function scaleParticlePos(oldWidth, oldHeight) {
  const widthRatio = width / oldWidth;
  const heightRatio = height / oldHeight;

  particles.forEach(p => {
    p.pos.x *= widthRatio;
    p.pos.y *= heightRatio;
  });
}
