// ===== CONFIGURATION =====
const CONFIG = {
  // Audio settings
  bufferSize: 512,
  fftSmoothing: 0.9,
  ampSmoothing: 0.9,
  bgmVolume: 0.5,
  coVolume: 0.5,
  o3Volume: 0.5,
  no2Volume: 0.5,
  so2Volume: 0.5,
  pm25Volume: 0.5,
  pm10Volume: 0.5,
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
let coSound = [];
let o3Sound = [];
let no2Sound = [];
let so2Sound = [];
let pm25Sound = [];
let pm10Sound = [];
let pollutantSounds = {
  "CO": coSound,
  "O3": o3Sound,
  "NO2": no2Sound,
  "SO2": so2Sound,
  "PM25": pm25Sound,
  "PM10": pm10Sound
};
let currentlyPlaying = {};


// Visualization state
let particles = [];
let wavePos = 512;
let horizScale;

// Graphics buffers
let canvasHist, mountainBuffer, circularBuffer;

// ===== CORE P5 FUNCTIONS =====
function preload() {
  nullBGM = loadSound("assets/audio/bgm/bgmSilence.mp3");
  hkgBGM = loadSound("assets/audio/bgm/bgmHKG.mp3");
  bkkBGM = loadSound("assets/audio/bgm/bgmBKK.mp3");

  loadPollutantSounds();

  fontRegular = loadFont("assets/font/RubikGlitch-Regular.ttf");
}

function setup() {
  setupCanvas();
  setupBuffers();
  setupAudio();
  setupMessageListener();
  setupDataFetching();
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

  const pollutantLvls = {
    pm25: {
      name: 'PM2.5',
      unit: 'μg/m³',
      levels: {
        good: { maxValue: 12.0, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 35.4, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 55.4, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 150.4, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 250.4, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 9999.9, label: 'Hazardous', color: [26, 0, 35] }
      }
    },
    pm10: {
      name: 'PM10',
      unit: 'μg/m³',
      levels: {
        good: { maxValue: 54.0, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 154.0, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 254.0, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 354.0, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 424.0, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 9999.9, label: 'Hazardous', color: [26, 0, 35] }
      }
    },
    so2: {
      name: 'SO₂',
      unit: 'µg/m³',
      levels: {
        good: { maxValue: 91.7, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 196.5, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 484.7, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 796.5, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 1582.5, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 2630.5, label: 'Hazardous', color: [26, 0, 35] }
      }
    },
    no2: {
      name: 'NO₂',
      unit: 'µg/m³',
      levels: {
        good: { maxValue: 100, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 188, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 676, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 1220, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 2346, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 3847, label: 'Hazardous', color: [26, 0, 35] }
      }
    },
    o3: {
      name: 'O₃',
      unit: 'µg/m³',
      levels: {
        good: { maxValue: 122, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 147, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 186, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 225, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 459, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 9999.9, label: 'Hazardous', color: [26, 0, 35] }
      }
    },
    co: {
      name: 'CO',
      unit: 'µg/m³',
      levels: {
        good: { maxValue: 5037, label: 'Good', color: [97, 251, 76] },
        moderate: { maxValue: 10772, label: 'Moderate', color: [255, 210, 0] },
        unhealthy4SG: { maxValue: 14201, label: 'Unhealthy for Sensitive Groups', color: [255, 126, 0] },
        unhealthy: { maxValue: 17638, label: 'Unhealthy', color: [229, 0, 19] },
        veryUnhealthy: { maxValue: 34814, label: 'Very Unhealthy', color: [143, 63, 151] },
        hazardous: { maxValue: 64504, label: 'Hazardous', color: [26, 0, 35] }
      }
    }
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

function loadPollutantSounds() {
  // Load 6 levels (0-5) for each pollutant
  for (let pLevel = 0; pLevel < 6; pLevel++) {
    coSound.push(loadSound("assets/audio/co/coSound_" + str(pLevel) + ".wav"));
    // o3Sound.push(loadSound("assets/audio/o3/o3Sound_" + str(pLevel) + ".mp3"));
    // no2Sound.push(loadSound("assets/audio/no2/no2Sound_" + str(pLevel) + ".mp3"));
    so2Sound.push(loadSound("assets/audio/so2/so2Sound_" + str(pLevel) + ".wav"));
    pm25Sound.push(loadSound("assets/audio/pm25/pm25Sound_" + str(pLevel) + ".mp3"));
    pm10Sound.push(loadSound("assets/audio/pm10/pm10Sound_" + str(pLevel) + ".mp3"));
  }
}

// ===== DATA PROCESSING =====
async function fetchData() {
  if (currentCity === 'None') {
    return; // Don't fetch if no city is selected
  }

  try {
    console.log(`Fetching air quality data for ${currentCity}`);
    const response = await fetch(`https://airphonic.onrender.com/api/get-latest?city=${currentCity}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Format the data
    const aqData = {
      aqius: result.find(item => item.name === "aqius")?.value || 0,
      pm25: result.find(item => item.name === "pm25")?.value || 0,
      pm10: result.find(item => item.name === "pm10")?.value || 0,
      so2: result.find(item => item.name === "so2")?.value || 0,
      no2: result.find(item => item.name === "no2")?.value || 0,
      o3: result.find(item => item.name === "o3")?.value || 0,
      co: result.find(item => item.name === "co")?.value || 0,
    };

    console.log("Received air quality data:", aqData);

    // Update pollutant sounds based on the data
    updatePollutantSoundsFromAQData(aqData);

    return aqData;
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    return null;
  }
}

// Function to update pollutant sounds based on AQ data
function updatePollutantSoundsFromAQData(aqData) {
  if (!aqData) return;

  // Define thresholds for each pollutant to determine sound levels (0-5)
  const thresholds = {
    pm25: [12.0, 35.4, 55.4, 150.4, 250.4], // PM2.5 thresholds
    pm10: [54.0, 154.0, 254.0, 354.0, 424.0], // PM10 thresholds
    so2: [91.7, 196.5, 484.7, 796.5, 1582.5], // SO2 thresholds
    no2: [100, 188, 676, 1220, 2346], // NO2 thresholds
    o3: [122, 147, 186, 225, 459], // O3 thresholds
    co: [5037, 10772, 14201, 17638, 34814], // CO thresholds
  };

  // Map AQ data to pollutant sounds
  const pollutantUpdates = {
    "PM25": {
      active: true,
      level: getLevelFromThresholds(aqData.pm25, thresholds.pm25) / 5
    },
    "PM10": {
      active: true,
      level: getLevelFromThresholds(aqData.pm10, thresholds.pm10) / 5
    },
    "SO2": {
      active: true,
      level: getLevelFromThresholds(aqData.so2, thresholds.so2) / 5
    },
    "NO2": {
      active: true,
      level: getLevelFromThresholds(aqData.no2, thresholds.no2) / 5
    },
    "O3": {
      active: true,
      level: getLevelFromThresholds(aqData.o3, thresholds.o3) / 5
    },
    "CO": {
      active: true,
      level: getLevelFromThresholds(aqData.co, thresholds.co) / 5
    }
  };

  // Update pollutant sounds
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
    updateBgmVolume(newVolume);
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
      stopAllPollutantSounds(); // Stop pollutant sounds for "None" or invalid city
      break;
  }

  // Play the new song if loaded
  if (song && song.isLoaded()) {
    initAudio();
    song.loop();
    song.setVolume(CONFIG.bgmVolume);

    // Re-enable pollutant sounds if switching back to a valid city
    if (newCity === "HKG" || newCity === "BKK") {
      const aqData = await fetchData(); // Fetch air quality data for the new city
      if (aqData) {
        updatePollutantSoundsFromAQData(aqData); // Update pollutant sounds based on the data
      }
    }
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

function updateBgmVolume(newVolume) {
  // console.log("Updating volume to:", newVolume);

  // Update the config value
  CONFIG.bgmVolume = newVolume;

  // Apply to current song if playing
  if (song && song.isLoaded()) {
    song.setVolume(newVolume);
  }
}

function getNormalizedPollutantName(name) {
  // Convert various formats to the standard keys used in pollutantSounds
  const nameMap = {
    // Standard keys
    "CO": "CO",
    "O3": "O3",
    "NO2": "NO2",
    "SO2": "SO2",
    "PM25": "PM25",
    "PM10": "PM10",

    // Alternative formats that might come from the control panel
    "O₃": "O3",
    "NO₂": "NO2",
    "SO₂": "SO2",
    "PM2.5": "PM25",
    "PM₂.₅": "PM25",
    "PM₁₀": "PM10"
  };

  return nameMap[name] || name;
}

function handlePollutantUpdate(pollutants) {
  console.log("Updating pollutants:", pollutants);

  // Process each pollutant
  for (const [name, data] of Object.entries(pollutants)) {
    // Normalize the pollutant name to match our sound array keys
    const normalizedName = getNormalizedPollutantName(name);

    // data.active is a boolean (true/false) indicating if the pollutant is enabled
    // data.level is a value between 0-1 indicating the pollution severity (which sound file to play)
    // data.volume is a value between 0-1 indicating how loud to play the sound

    if (data.active) {
      // Convert the 0-1 level value to a discrete level between 0-5
      const discreteLevel = Math.floor(data.level * 5);

      // Play the pollution level sound at the specified volume
      playPollutantSound(normalizedName, discreteLevel, data.volume);
    } else {
      // Pollutant is inactive, stop its sound
      stopPollutantSound(normalizedName);
    }
  }
}


function playPollutantSound(name, level, volume = 0.7) {
  // Ensure level is within bounds (0-5)
  level = constrain(level, 0, 5);

  // Get the sound array for this pollutant
  const soundArray = pollutantSounds[name];

  if (!soundArray || !soundArray[level]) {
    console.warn(`Sound for pollutant ${name} level ${level} not found`);
    return;
  }

  // Check if we're already playing this exact sound
  if (currentlyPlaying[name] === level) {
    // Already playing this exact level, just update volume if needed
    const currentVolume = currentlyPlaying[name + "_volume"];
    if (currentVolume !== volume) {
      soundArray[level].setVolume(volume);
      currentlyPlaying[name + "_volume"] = volume;
      console.log(`Updated ${name} sound volume to ${volume.toFixed(2)}`);
    }
    return;
  }

  // Stop any currently playing sound for this pollutant
  stopPollutantSound(name);

  // Set volume based on the provided volume parameter
  soundArray[level].setVolume(volume);

  // Start playing and looping the sound
  soundArray[level].loop();

  // Track which sound is playing and its volume
  currentlyPlaying[name] = level;
  currentlyPlaying[name + "_volume"] = volume;

  console.log(`Playing ${name} sound at level ${level} with volume ${volume.toFixed(2)}`);
}

function stopPollutantSound(name) {
  const soundArray = pollutantSounds[name];

  if (!soundArray) {
    console.warn(`Sound array for pollutant ${name} not found`);
    return;
  }

  // Stop all sounds for this pollutant
  for (let i = 0; i < soundArray.length; i++) {
    if (soundArray[i] && soundArray[i].isPlaying()) {
      soundArray[i].stop();
    }
  }

  // Remove from currently playing
  delete currentlyPlaying[name];
}

function stopAllPollutantSounds() {
  for (const pollutant in pollutantSounds) {
    stopPollutantSound(pollutant);
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
