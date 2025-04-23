
// Configuration
const SERVER_ADDRESS = 'ws://127.0.0.1:8080'; // Localhost for testing
// const SERVER_ADDRESS = 'wss://airphonic-websockets.onrender.com'; // Production

// Global variables
let socket;
let messageQueue = [];

// Configuration settings
const CONFIG = {
  // Audio settings
  bufferSize: 512,
  fftSmoothing: 0.9,
  ampSmoothing: 0.9,
  bgmVolume: 0.5,

  // Consolidated pollutant volumes into a single object
  pollutantVolumes: {
    CO: 0.5,
    O3: 0.5,
    NO2: 0.5,
    SO2: 0.5,
    PM25: 0.5,
    PM10: 0.5
  },

  minVolume: 0,
  maxVolume: 1,

  // Mountain visualization
  mountainSensitivity: 2,
  mountainStepSize: 2,
  frameInterval: 3,

  // Circular visualization
  historyLayers: 40,
  spectrumRange: 0.2,
  brightnessMult: 2,
  spacingFactor: 2,

  // Particles
  maxParticles: 500, // Reduced for performance
  highEnergyThreshold: 230,

  // Colors (HSB format)
  colors: {
    primary: [120, 100, 45], // Green
    accent: [200, 0, 60] // Blue-ish for particles
  },

  o3Effect: {
    maxUVRays: 5,         // Increased for better coverage
    maxNOxParticles: 30,   // More particles for better effect
    maxOzoneBursts: 10,    // More concurrent bursts
    collisionDistance: 5,
    rayMinLength: 200,     // Minimum ray length
    rayMaxLength: null,    // Will be set to height in setup
    raySpeed: { min: 3, max: 5 },
    rayThickness: { min: 5, max: 30 },
    rayBrightness: { min: 50, max: 100 }
  },

  coEffect: {
    maxParticles: 150,
    spawnInterval: 10,
    spawnTimer: 0,
    particleRate: 5,
    particleAlpha: 75,
    particleAmp: 3
  }
};

// AQI color mapping
const AQI_COLORS = {
  50: [120, 100, 80],    // Good - Green
  100: [60, 100, 100],   // Moderate - Yellow
  150: [30, 100, 100],   // Unhealthy for Sensitive Groups - Orange
  200: [0, 100, 100],    // Unhealthy - Red
  300: [270, 60, 60],    // Very Unhealthy - Purple
  max: [345, 100, 50]    // Hazardous - Maroon
};

// ===== STATE VARIABLES =====
// App state
let started = false;
let audioStarted = false;
let isAudioLoading = false;
let currentCity = "None";

// Audio components
let song;
let fft, analyzer, audioContext, analyserNode;
let frequencies = [];
let avgAmplitude = 0;
let spectrumHist = [];

// Assets files
let nullBGM, hkgBGM, bkkBGM;
let fontRegular;
let pollutantSounds = {
  "CO": [],
  "O3": [],
  "NO2": [],
  "SO2": [],
  "PM25": [],
  "PM10": []
};
let currentlyPlaying = {};
let aqData = {
  "AQI (US)": 0,
  "PM₂.₅": 0,
  "PM₁₀": 0,
  "SO₂": 0,
  "NO₂": 0,
  "O₃": 0,
  "CO": 0
};

// Visualization state
let particles = [];
let wavePos = 512;
let horizScale;
let projScale = 1;

// --- O₃ sketch state ---
let o3_uvRays = [];
let o3_noxParticles = [];
let o3_ozoneBursts = [];

// --- CO sketch state ---
let co_particles = [];
let CO_saturated = false;

// Graphics buffers
let canvasHist, mountainBuffer, circularBuffer;

// ===== CORE P5 FUNCTIONS =====
function preload() {
  nullBGM = loadSound("assets/audio/bgm/bgmSilence.mp3");
  hkgBGM = loadSound("assets/audio/bgm/bgmHKG.mp3");
  bkkBGM = loadSound("assets/audio/bgm/bgmBKK.mp3");

  loadPollutantSounds();

  fontRegular = loadFont("assets/font/Quadaptor.otf");
}

function setup() {
  setupCanvas();
  setupBuffers();
  setupAudio();
  setupWebSocket();
  setupDataFetching();
  started = true;

  // --- Init O₃ effect ---
  for (let i = 0; i < CONFIG.o3Effect.maxUVRays; i++) {
    o3_uvRays.push(new O3_UVRay());
  }
  for (let i = 0; i < CONFIG.o3Effect.maxNOxParticles; i++) {
    o3_noxParticles.push(new O3_NOxParticle());
  }

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

  // Process ONE message from the queue per frame
  processMessageQueue();

  updateAudioData();

  // Draw visualizations
  drawMountainVis();
  drawCircularVis();

  // Display both visualizations
  image(mountainBuffer, 0, 0);

  if (currentlyPlaying["O3"] !== undefined) {
    drawO3Effect();
  }

  if (currentlyPlaying["PM25"] !== undefined || currentlyPlaying["PM10"] !== undefined) {
    drawPMParticles();
  }

  if (currentlyPlaying["CO"] !== undefined) {
    drawCOEffect();
  }

  image(circularBuffer, 0, 0);

  displayAirInfo();
  displayTime();
}

// ===== SETUP FUNCTIONS =====
function setupCanvas() {
  const sketchCanvas = createCanvas(windowWidth, windowHeight);
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

function setupWebSocket() {
  console.log(`Showcase: Connecting to WebSocket at ${SERVER_ADDRESS}`);

  try {
    socket = new WebSocket(SERVER_ADDRESS);

    socket.onopen = () => console.log('Showcase: WebSocket connection opened');
    socket.onerror = (error) => console.error('Showcase: WebSocket Error: ', error);
    socket.onclose = (event) => console.log(`Showcase: WebSocket closed. Code: ${event.code}`);

    socket.onmessage = handleWebSocketMessage;
  } catch (e) {
    console.error("Showcase: Failed to create WebSocket", e);
  }
}

function handleWebSocketMessage(event) {
  let receivedDataString;

  // Ensure data is a string
  if (typeof event.data === 'string') {
    receivedDataString = event.data;
  } else {
    console.warn("Showcase: event.data was not a string! Type:", typeof event.data);
    receivedDataString = String(event.data);
  }

  // Parse the data
  try {
    const parsedData = JSON.parse(receivedDataString);
    messageQueue.push(parsedData);
  } catch (e) {
    console.error('Showcase: Error parsing received string:', e);
    console.error('Showcase: The string that failed parsing was:', receivedDataString);
  }
}

function processMessageQueue() {
  if (messageQueue.length > 0) {
    const dataToProcess = messageQueue.shift(); // Get the oldest message from the queue
    handleReceivedData(dataToProcess);
  }
}

function startAudio() {
  audioContext.resume().then(() => {
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

function loadPollutantSounds() {

  // Load 6 levels (0-5) for each pollutant
  for (let pLevel = 0; pLevel < 6; pLevel++) {
    pollutantSounds["CO"].push(loadSound(`assets/audio/co/coSound_${pLevel}.wav`));
    pollutantSounds["O3"].push(loadSound(`assets/audio/o3/o3Sound_${pLevel}.mp3`));
    pollutantSounds["NO2"].push(loadSound(`assets/audio/no2/no2Sound_${pLevel}.mp3`));
    pollutantSounds["SO2"].push(loadSound(`assets/audio/so2/so2Sound_${pLevel}.wav`));
    pollutantSounds["PM25"].push(loadSound(`assets/audio/pm25/pm25Sound_${pLevel}.mp3`));
    pollutantSounds["PM10"].push(loadSound(`assets/audio/pm10/pm10Sound_${pLevel}.mp3`));
  }
}

// ===== DATA PROCESSING =====
async function fetchData() {
  if (currentCity === 'None') {
    return; // Don't fetch if no city is selected
  }

  try {
    const response = await fetch(`https://airphonic.onrender.com/api/get-latest?city=${currentCity}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Format the data and update global aqData object
    updateAQData(result);

    // Create a formatted object for pollutant sound updates
    const aqDataForSounds = {
      aqius: result.find(item => item.name === "aqius")?.value || 0,
      pm25: result.find(item => item.name === "pm25")?.value || 0,
      pm10: result.find(item => item.name === "pm10")?.value || 0,
      so2: result.find(item => item.name === "so2")?.value || 0,
      no2: result.find(item => item.name === "no2")?.value || 0,
      o3: result.find(item => item.name === "o3")?.value || 0,
      co: result.find(item => item.name === "co")?.value || 0,
    };

    // Update pollutant sounds based on the data
    updatePollutantSoundsFromAQData(aqDataForSounds);

    return aqDataForSounds;
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    return null;
  }
}

function updateAQData(result) {
  aqData = {
    "AQI (US)": result.find(item => item.name === "aqius")?.value || 0,
    "PM₂.₅": result.find(item => item.name === "pm25")?.value || 0,
    "PM₁₀": result.find(item => item.name === "pm10")?.value || 0,
    "SO₂": result.find(item => item.name === "so2")?.value || 0,
    "NO₂": result.find(item => item.name === "no2")?.value || 0,
    "O₃": result.find(item => item.name === "o3")?.value || 0,
    "CO": result.find(item => item.name === "co")?.value || 0
  };

  // Convert PPM to µg/m³ for Bangkok
  if (currentCity === 'Bangkok') {
    const coPpm = result.find(item => item.name === "co")?.value || 0;
    aqData["CO"] = ppmToUgm3('co', coPpm);

    const no2Ppm = result.find(item => item.name === "no2")?.value || 0;
    aqData["NO₂"] = ppmToUgm3('no2', no2Ppm);

    const o3Ppm = result.find(item => item.name === "o3")?.value || 0;
    aqData["O₃"] = ppmToUgm3('o3', o3Ppm);

    const so2Ppm = result.find(item => item.name === "so2")?.value || 0;
    aqData["SO₂"] = ppmToUgm3('so2', so2Ppm);
  }
}

// Function to update pollutant sounds based on AQ data
function updatePollutantSoundsFromAQData(aqData) {
  if (!aqData) return;

  const thresholds = {
    pm25: [12.0, 35.4, 55.4, 150.4, 250.4],
    pm10: [54.0, 154.0, 254.0, 354.0, 424.0],
    so2: [91.7, 196.5, 484.7, 796.5, 1582.5],
    no2: [100, 188, 676, 1220, 2346],
    o3: [122, 147, 186, 225, 459],
    co: [5037, 10772, 14201, 17638, 34814],
  };

  // Create pollutant updates, preserving active state from currentlyPlaying
  const pollutantUpdates = {
    "PM25": {
      active: currentlyPlaying["PM25"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.pm25, thresholds.pm25) / 5
    },
    "PM10": {
      active: currentlyPlaying["PM10"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.pm10, thresholds.pm10) / 5
    },
    "SO2": {
      active: currentlyPlaying["SO2"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.so2, thresholds.so2) / 5
    },
    "NO2": {
      active: currentlyPlaying["NO2"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.no2, thresholds.no2) / 5
    },
    "O3": {
      active: currentlyPlaying["O3"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.o3, thresholds.o3) / 5
    },
    "CO": {
      active: currentlyPlaying["CO"] !== undefined, // Preserve active state
      level: getLevelFromThresholds(aqData.co, thresholds.co) / 5
    }
  };

  // Only update sounds for pollutants that should be playing
  handlePollutantUpdate(pollutantUpdates);
}

// Helper function to determine level based on thresholds
function getLevelFromThresholds(value, thresholds) {
  if (value === undefined || value === null) return 0;

  // Find the appropriate level based on thresholds
  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) {
      return i;
    }
  }

  // If above all thresholds, return the highest level (5)
  return 5;
}

// Setup interval for data fetching
function setupDataFetching() {
  // Initial fetch
  fetchData();

  // Set up interval for periodic fetching (every 60 seconds)
  setInterval(fetchData, 60000);
}

// Convert gas concentration from PPM to µg/m³
function ppmToUgm3(gas, ppm) {
  // Molar volume at 25°C and 1 atm in m³/mol
  const molarVolume = 0.02445;

  // Molecular weights in g/mol for each gas
  const molecularWeights = {
    'co': 28,
    'no2': 46,
    'o3': 48,
    'so2': 64
  };

  // Get the molecular weight for the specified gas (case-insensitive)
  const M = molecularWeights[gas.toLowerCase()];

  // Check if the gas is valid
  if (!M) {
    throw new Error('Unknown gas. Please use "CO", "NO2", "O3", or "SO2".');
  }

  // Calculate and return the concentration in µg/m³
  return Number((ppm * (M / molarVolume)).toFixed(1));
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
}

function updateAudioData() {
  if (analyserNode) {
    analyserNode.getByteTimeDomainData(frequencies);
  }

  const currentLevel = analyzer.getLevel();
  avgAmplitude = lerp(avgAmplitude, currentLevel, 1 - CONFIG.ampSmoothing);
}

function handleReceivedData(receivedData) {
  // console.log("Showcase: Handling received data:", JSON.stringify(receivedData));

  // Extract data properties
  const newCity = receivedData?.currentCity;
  const newVolume = parseFloat(receivedData?.bgmVolume);
  const pollutants = receivedData?.pollutants;

  // Apply changes
  if (newCity && newCity !== currentCity) {
    // console.log("Showcase: Changing city to:", newCity);
    handleCityChange(newCity);
  }

  if (!isNaN(newVolume)) {
    // console.log("Showcase: Updating volume to:", newVolume);
    updateBgmVolume(constrain(newVolume, CONFIG.minVolume, CONFIG.maxVolume));
  }

  if (pollutants) {
    // console.log("Showcase: Updating pollutants");
    handlePollutantUpdate(pollutants);
  }
}

async function handleCityChange(newCity) {
  if (song && song.isLoaded() && song.isPlaying()) {
    song.setVolume(0, 0.5);
    setTimeout(() => {
      song.stop();
      song.disconnect();
    }, 500);
  }

  currentCity = newCity;

  if (newCity === "None") {
    stopAllPollutantSounds();
  }

  // Select the new song
  switch (newCity) {
    case "HongKong":
      song = hkgBGM;
      break;
    case "Bangkok":
      song = bkkBGM;
      break;
    default:
      song = nullBGM;
      break;
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  if (song && song.isLoaded()) {
    initAudio();
    song.setVolume(0);
    song.loop();
    song.setVolume(CONFIG.bgmVolume, 0.5);

    if (newCity === "HongKong" || newCity === "Bangkok") {
      const aqData = await fetchData(); // Fetch air quality data for the new city
    }
  } else {
    console.error("Selected song is not loaded:", newCity);

    if (nullBGM && nullBGM.isLoaded()) {
      song = nullBGM;
      initAudio();
      song.loop();
      song.setVolume(CONFIG.bgmVolume, 0.5);
    }
  }
}

function updateBgmVolume(newVolume) {
  // Update the config value
  CONFIG.bgmVolume = newVolume;

  // Apply to current song if playing
  if (song && song.isLoaded()) {
    song.setVolume(newVolume);
  }
}

// Normalize pollutant names to standard format
function getNormalizedPollutantName(name) {
  const nameMap = {
    // Standard keys
    "CO": "CO",
    "O3": "O3",
    "NO2": "NO2",
    "SO2": "SO2",
    "PM25": "PM25",
    "PM10": "PM10",

    // Alternative formats
    "O₃": "O3",
    "NO₂": "NO2",
    "SO₂": "SO2",
    "PM2.5": "PM25",
    "PM₂.₅": "PM25",
    "PM₁₀": "PM10"
  };

  return nameMap[name] || name;
}

// Update pollutant sounds based on control panel input
function handlePollutantUpdate(pollutants) {
  for (const [name, data] of Object.entries(pollutants)) {
    const normalizedName = getNormalizedPollutantName(name);

    if (data.active) {
      const discreteLevel = Math.floor(data.level * 5);
      playPollutantSound(normalizedName, discreteLevel, data.volume);
    } else {
      stopPollutantSound(normalizedName);
    }
  }
}

function playPollutantSound(name, level, volume = 0.5) {
  level = constrain(level, 0, 5);

  const soundArray = pollutantSounds[name];

  if (!soundArray || !soundArray[level]) {
    console.warn(`Sound for pollutant ${name} level ${level} not found`);
    return;
  }

  if (currentlyPlaying[name] === level) {
    const currentVolume = currentlyPlaying[name + "_volume"];
    if (currentVolume !== volume) {
      const sound = soundArray[level];
      const fadeTime = 0.1; // 100ms fade
      sound.setVolume(volume, fadeTime);
      currentlyPlaying[name + "_volume"] = volume;
    }
    return;
  }

  if (currentlyPlaying[name] !== undefined) {
    const oldLevel = currentlyPlaying[name];
    const oldSound = soundArray[oldLevel];
    oldSound.setVolume(0, 0.1);
    setTimeout(() => oldSound.stop(), 100);
  }

  soundArray[level].setVolume(0);
  soundArray[level].loop();
  soundArray[level].setVolume(volume, 0.1);

  currentlyPlaying[name] = level;
  currentlyPlaying[name + "_volume"] = volume;
}

function stopPollutantSound(name) {
  const soundArray = pollutantSounds[name];

  if (!soundArray) {
    console.warn(`Sound array for pollutant ${name} not found`);
    return;
  }

  // Get currently playing sound for this pollutant
  const currentLevel = currentlyPlaying[name];
  if (currentLevel !== undefined) {
    const sound = soundArray[currentLevel];
    if (sound && sound.isPlaying()) {
      // Fade out over 500ms before stopping
      sound.setVolume(0, 0.5);
      setTimeout(() => {
        sound.stop();
        // Remove from currently playing after fade out
        delete currentlyPlaying[name];
        delete currentlyPlaying[name + "_volume"];
      }, 500);
    }
  }
}

function stopAllPollutantSounds() {
  Object.keys(pollutantSounds).forEach(pollutant => {
    const soundArray = pollutantSounds[pollutant];
    const currentLevel = currentlyPlaying[pollutant];

    if (currentLevel !== undefined && soundArray[currentLevel]?.isPlaying()) {
      // Fade out each active sound
      soundArray[currentLevel].setVolume(0, 0.5);
      setTimeout(() => {
        soundArray[currentLevel].stop();
      }, 500);
    }
  });

  // Clear currentlyPlaying after fade out
  setTimeout(() => {
    currentlyPlaying = {};
  }, 500);
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
      i * horizScale * projScale,
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

  // Get AQI color for visualization
  const aqiValue = aqData["AQI (US)"];
  const aqiColor = getAQIColor(aqiValue);

  // Extract HSB values from the color for use in visualization
  const aqiHue = hue(aqiColor);
  const aqiSaturation = saturation(aqiColor);
  const aqiBrightness = brightness(aqiColor);

  circularBuffer.push();
  circularBuffer.translate(width / 2, height / 2);

  drawSpectrumHistory(circularBuffer, spectrum, aqiHue, aqiSaturation);
  drawCenterCircle(circularBuffer, aqiHue, aqiSaturation, aqiBrightness);

  circularBuffer.pop();
}

function drawSpectrumHistory(buffer, spectrum, aqiHue, aqiSaturation) {
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
    drawSpectrumLayer(buffer, spectrumHist[i], i, numBands, aqiHue, aqiSaturation);
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

function drawSpectrumLayer(buffer, layer, index, numBands, aqiHue, aqiSaturation) {
  // Calculate visual properties
  const layerRatio = index / spectrumHist.length;
  const brightness = map(index, 0, spectrumHist.length, 255, 100);
  const alpha = map(index, 0, spectrumHist.length, 1, 0.3) * avgAmplitude * CONFIG.brightnessMult;
  const radiusMult = 1 + layerRatio * CONFIG.spacingFactor;

  // Set color using the AQI hue
  buffer.stroke(aqiHue, aqiSaturation, brightness, alpha);

  // Only fill the newest layer
  if (index === 0) {
    buffer.fill(aqiHue, aqiSaturation, brightness, 0.2 * avgAmplitude * CONFIG.brightnessMult);
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

function drawCenterCircle(buffer, aqiHue, aqiSaturation, aqiBrightness) {
  // Use AQI color for center circle
  buffer.fill(aqiHue, aqiSaturation, aqiBrightness);
  buffer.circle(0, 0, 80 * projScale);

  // Add text to show AQI value in center
  buffer.textFont(fontRegular);
  buffer.fill(0);
  buffer.textAlign(CENTER, CENTER);
  buffer.textSize(24 * projScale);
  buffer.text(aqData["AQI (US)"], 0, 0);
}

// ===== PARTICLE SYSTEM =====
function createParticle(isHighEnergy, aqiHue) {
  const pos = p5.Vector.random2D().mult(60 * projScale);

  // Use AQI hue with randomized brightness for particles
  const particleHue = aqiHue || CONFIG.colors.accent[0];

  return {
    pos: pos,
    vel: createVector(0, 0),
    acc: pos.copy().mult(random(0.0001, 0.00001)),
    size: isHighEnergy ? random(5, 25) : random(3, 6),
    color: color(particleHue, CONFIG.colors.accent[1], random(30, 80))
  };
}

function updateAndDrawParticles(buffer, isHighEnergy, aqiHue) {
  // Add new particles if conditions met
  if (song.isPlaying() && particles.length < CONFIG.maxParticles) {
    particles.push(createParticle(isHighEnergy, aqiHue));
  }

  // Update and draw particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (isParticleOffscreen(p)) {
      particles.splice(i, 1);
      continue;
    }

    updateParticle(p, isHighEnergy);
    drawParticle(buffer, p);
  }
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


// ===== DISPLAY FUNCTIONS =====
function displayAirInfo() {
  const FONT_SIZE = 32 * projScale;
  const SPACING = 40 * projScale;
  const MARGIN = 20;

  push();
  textFont(fontRegular);
  textSize(FONT_SIZE);
  colorMode(HSB);

  // Pollutant thresholds for color mapping
  const thresholds = {
    "PM₂.₅": [12.0, 35.4, 55.4, 150.4, 250.4],
    "PM₁₀": [54.0, 154.0, 254.0, 354.0, 424.0],
    "SO₂": [91.7, 196.5, 484.7, 796.5, 1582.5],
    "NO₂": [100, 188, 676, 1220, 2346],
    "O₃": [122, 147, 186, 225, 459],
    "CO": [5037, 10772, 14201, 17638, 34814]
  };

  // Define pollutant data structure
  const pollutants = [
    { name: "PM₂.₅", key: "PM₂.₅" },
    { name: "PM₁₀", key: "PM₁₀" },
    { name: "SO₂", key: "SO₂" },
    { name: "NO₂", key: "NO₂" },
    { name: "O₃", key: "O₃" },
    { name: "CO", key: "CO" }
  ];

  // Draw pollutant values from bottom up
  let yPos = height - MARGIN;
  pollutants.forEach(({ name, key }) => {
    const value = aqData[key];
    const level = getPollutantLevel(value, thresholds[name]);
    const color = getPollutantColor(level);

    // Set the color for this pollutant text
    fill(color[0], color[1], color[2]);
    text(`${name}: ${value} μg/m³`, MARGIN, yPos);
    yPos -= SPACING;
  });

  pop();
}

function getAQIColor(aqi) {
  const AQI_COLORS = {
    50: [120, 100, 80],  // Good - Green
    100: [60, 100, 100],  // Moderate - Yellow
    150: [30, 100, 100],  // Unhealthy for Sensitive Groups - Orange
    200: [0, 100, 100],   // Unhealthy - Red
    300: [270, 60, 60],   // Very Unhealthy - Purple
    max: [345, 100, 50]   // Hazardous - Maroon
  };

  for (const threshold of Object.keys(AQI_COLORS)) {
    if (aqi <= threshold) return AQI_COLORS[threshold];
  }
  return AQI_COLORS.max;
}

function getPollutantLevel(value, thresholds) {
  if (value === undefined || value === null) return 0;

  for (let i = 0; i < thresholds.length; i++) {
    if (value <= thresholds[i]) {
      return i;
    }
  }
  return 5; // Maximum level if above all thresholds
}

function getPollutantColor(level) {
  // Using the same color scheme as AQI colors
  const colors = {
    0: [120, 100, 80],  // Good - Green
    1: [60, 100, 100],  // Moderate - Yellow
    2: [30, 100, 100],  // Unhealthy for Sensitive Groups - Orange
    3: [0, 100, 100],   // Unhealthy - Red
    4: [270, 60, 60],   // Very Unhealthy - Purple
    5: [345, 100, 50]   // Hazardous - Maroon
  };

  return colors[level] || colors[5];
}

function displayLoadingScreen() {
  displayCenteredText("Loading audio...");
}

function displayStartAudioPrompt() {
  displayCenteredText("Click anywhere to start");
}

function displayTime() {
  const FONT_SIZE = 32 * projScale;
  const SPACING = 30 * projScale;
  const MARGIN = 20;

  push();
  textFont(fontRegular);
  fill(255);
  textSize(FONT_SIZE);

  const now = new Date();
  const timeString = formatTime(now);

  text(timeString, width - MARGIN - textWidth(timeString), height - SPACING);
  pop();
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}


function displayCenteredText(message) {
  push();
  fill(255);
  textSize(32 * projScale);
  textAlign(CENTER, CENTER);
  textFont(fontRegular);
  text(message, width / 2, height / 2);
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

// ===== BUFFER MANAGEMENT =====
// Recreates graphical buffers with new dimensions
function recreateBuffers(oldBuffers, oldDimensions) {
  // Initialize new buffers
  const newBuffers = {
    canvasHist: createBuffer(),
    mountainBuffer: createBuffer(),
    circularBuffer: createCircularBuffer()
  };

  // Copy old content with scaling
  Object.entries(newBuffers).forEach(([key, buffer]) => {
    buffer.image(oldBuffers[key], 0, 0, width, height);
  });

  // Update global references
  Object.assign(window, newBuffers);
}

// Creates a basic graphics buffer
function createBuffer() {
  const buffer = createGraphics(width, height);
  buffer.background(0, 0);
  return buffer;
}

// Creates a circular visualization buffer
function createCircularBuffer() {
  const buffer = createBuffer();
  buffer.angleMode(DEGREES);
  buffer.colorMode(HSB);
  return buffer;
}

// Updates particle positions when canvas is resized
function scaleParticlePos(oldWidth, oldHeight) {
  const scale = {
    x: width / oldWidth,
    y: height / oldHeight
  };

  particles.forEach(particle => {
    particle.pos.x *= scale.x;
    particle.pos.y *= scale.y;
  });
}


// ===== POLLUTANT EFFECTS =====
// PM Effects
function drawPMParticles() {
  const pm10Active = currentlyPlaying["PM10"] !== undefined;
  const pm25Active = currentlyPlaying["PM25"] !== undefined;

  if (!pm10Active && !pm25Active) {
    particles = []; // Clear particles if no PM is active
    return;
  }

  const bassEnergy = fft.getEnergy(20, 200);
  const isHighEnergy = bassEnergy > CONFIG.highEnergyThreshold;

  // Use PM level to affect particle appearance
  const pmLevel = Math.max(
    currentlyPlaying["PM10"] || 0,
    currentlyPlaying["PM25"] || 0
  ) / 5; // Normalized level (0-1)

  push();
  translate(width / 2, height / 2);

  // Add new particles if needed
  if (particles.length < CONFIG.maxParticles) {
    particles.push(createParticle(isHighEnergy, pmLevel * 360)); // Use PM level for hue
  }

  // Update and draw existing particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (isParticleOffscreen(p)) {
      particles.splice(i, 1);
      continue;
    }

    updateParticle(p, isHighEnergy);

    // Draw with opacity based on PM level
    noStroke();
    const c = p.color;
    fill(hue(c), saturation(c), brightness(c),
      map(pmLevel, 0, 1, 100, 255));
    ellipse(p.pos.x, p.pos.y, p.size);
  }

  pop();
}

// O3 Effects
class O3_UVRay {
  constructor() {
    CONFIG.o3Effect.rayMaxLength = height; // Set max length based on canvas height
    this.reset();
  }

  reset() {
    // Center-based positioning
    this.startX = width / 2;
    this.startY = height / 2;
    this.angle = random(360);
    this.maxLength = random(CONFIG.o3Effect.rayMinLength, CONFIG.o3Effect.rayMaxLength);
    this.speed = random(CONFIG.o3Effect.raySpeed.min, CONFIG.o3Effect.raySpeed.max);
    this.length = 0;
    this.endX = this.startX;
    this.endY = this.startY;
    this.thickness = random(CONFIG.o3Effect.rayThickness.min, CONFIG.o3Effect.rayThickness.max);
    this.brightness = random(CONFIG.o3Effect.rayBrightness.min, CONFIG.o3Effect.rayBrightness.max);
  }

  update() {
    this.length += this.speed;
    if (this.length > this.maxLength) {
      this.reset();
    }
    this.endX = this.startX + cos(this.angle) * this.length;
    this.endY = this.startY + sin(this.angle) * this.length;
  }

  show() {
    let alpha = map(this.length, 0, this.maxLength, 255, 100);
    stroke(250, 100, this.brightness, alpha);
    strokeWeight(this.thickness);
    line(this.startX, this.startY, this.endX, this.endY);
  }

  hits(particle) {
    let dx = particle.pos.x - this.startX;
    let dy = particle.pos.y - this.startY;
    let dirX = cos(this.angle);
    let dirY = sin(this.angle);
    let dotProduct = (dx * dirX + dy * dirY);

    if (dotProduct > 0 && dotProduct < this.length) {
      let perpX = this.startX + dirX * dotProduct;
      let perpY = this.startY + dirY * dotProduct;
      let perpDist = dist(particle.pos.x, particle.pos.y, perpX, perpY);
      return perpDist < CONFIG.o3Effect.collisionDistance;
    }
    return false;
  }
}

class O3_NOxParticle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().mult(random(0.2, 0.6));
  }

  move() {
    this.pos.add(this.vel);
    this.edges();
  }

  edges() {
    if (this.pos.x > width || this.pos.x < 0) this.vel.x *= -1;
    if (this.pos.y > height || this.pos.y < 0) this.vel.y *= -1;
  }

  display() {
    noStroke();
    fill(210, 100, 255);
    ellipse(this.pos.x, this.pos.y, 6);
  }
}

class O3_OzoneBurst {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.r = 10;
    this.opacity = 255;
    // Random color from predefined range
    this.hue = random([
      random(345, 360), // Red (part 1)
      random(0, 10),    // Red (part 2)
      random(250, 290), // Purple
      random(290, 330), // Pink
      random(180, 250)  // Blue
    ]);
  }

  update() {
    this.r += 2;
    this.opacity -= 6;
  }

  show() {
    noFill();
    blendMode(ADD);

    // Glow effect with multiple layers
    for (let i = 0; i < 5; i++) {
      let glowOpacity = map(this.opacity * (1 - i * 0.2), 0, 255, 0, 100);
      let glowRadius = this.r + i * 10;
      strokeWeight(1);
      stroke(this.hue, 80, 100, glowOpacity);
      ellipse(this.pos.x, this.pos.y, glowRadius);
    }

    // Core circle
    strokeWeight(1.5);
    stroke(270, 80, 100, map(this.opacity, 0, 255, 0, 100));
    ellipse(this.pos.x, this.pos.y, this.r);
    blendMode(BLEND);
  }

  finished() {
    return this.opacity <= 0;
  }
}

function drawO3Effect() {
  push();
  colorMode(HSB, 360, 100, 100, 255);

  // Apply blur effect to UV rays
  drawingContext.filter = 'blur(2px)';
  for (let ray of o3_uvRays) {
    ray.update();
    ray.show();
  }
  drawingContext.filter = 'none';

  // Update NOx particles and check collisions
  for (let p of o3_noxParticles) {
    p.move();
    p.display();

    if (o3_ozoneBursts.length < CONFIG.o3Effect.maxOzoneBursts) {
      for (let ray of o3_uvRays) {
        if (ray.hits(p)) {
          o3_ozoneBursts.push(new O3_OzoneBurst(p.pos.x, p.pos.y));
          break;
        }
      }
    }
  }

  // Update and draw bursts
  for (let i = o3_ozoneBursts.length - 1; i >= 0; i--) {
    o3_ozoneBursts[i].update();
    o3_ozoneBursts[i].show();
    if (o3_ozoneBursts[i].finished()) {
      o3_ozoneBursts.splice(i, 1);
    }
  }

  pop();
}

// CO Effects
class COParticle {
  constructor(x, y, r, a) {
    this.location = createVector(x, y);
    this.velocity = p5.Vector.random2D().mult(0.5);
    this.acceleration = createVector();
    this.alpha = this.palpha = a;
    this.amp = CONFIG.coEffect.particleAmp;
    this.rate = r;

    // Get current CO level and color
    const coValue = aqData["CO"];
    const coThresholds = [5037, 10772, 14201, 17638, 34814];
    const level = getPollutantLevel(coValue, coThresholds);
    const color = getPollutantColor(level);
    this.color = color;
  }

  update(p) {
    // Perlin noise movement
    this.acceleration.add(
      createVector(
        noise(this.location.x) * 2 - 1,
        noise(this.location.y) * 2 - 1
      )
    );
    this.velocity.add(this.acceleration);
    this.acceleration.set(0, 0);
    this.location.add(this.velocity);
    this.alpha -= this.rate;

    // Recursive spawn with reduced alpha for child particles
    if (this.alpha <= this.palpha * 0.25 && this.palpha > 10) {
      p.push(
        new COParticle(
          this.location.x,
          this.location.y,
          this.rate * 0.25,
          this.palpha * 0.3  // Reduced from 0.5 to 0.3 for more transparency
        )
      );
    }
  }

  show() {
    noStroke();
    // Use the color based on pollution level with reduced opacity
    fill(
      this.color[0],     // Hue
      this.color[1],     // Saturation
      this.color[2],     // Brightness
      this.alpha * 0.5   // Reduced alpha by 50% for more transparency
    );
    ellipse(this.location.x, this.location.y, this.amp);
  }
}

function drawCOEffect() {
  blendMode(BLEND);
  push();
  colorMode(HSB);

  CONFIG.coEffect.spawnTimer++;

  // Spawn new particles at intervals
  if (CONFIG.coEffect.spawnTimer % CONFIG.coEffect.spawnInterval === 0 &&
    co_particles.length < CONFIG.coEffect.maxParticles) {
    let x = random(width);
    let y = random(height);
    co_particles.push(
      new COParticle(
        x,
        y,
        CONFIG.coEffect.particleRate,
        CONFIG.coEffect.particleAlpha
      )
    );
  }

  // Update and draw particles
  for (let i = co_particles.length - 1; i >= 0; i--) {
    co_particles[i].update(co_particles);
    co_particles[i].show();

    if (co_particles[i].alpha <= 2) {
      co_particles.splice(i, 1);
    }
  }

  CO_saturated = co_particles.length >= CONFIG.coEffect.maxParticles;

  pop();
}
