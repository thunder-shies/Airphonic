let gui;
let sketchCanvas; // Declare at top for global access
let hkToggle, bkkToggle, timeSlider, volSlider;
let toggles = {}; // Use toggles instead of checkboxes
let sliders = {};
let labels = ["CO", "O₃", "NO₂", "SO₂", "PM₂.₅", "PM₁₀"];

function setup() {
  setupCanvas();
  gui = createGui();
  gui.loadStyle("Gray");
  initElements();

  // Initially hide all elements
  hideElements();
  registerServiceWorker("../service-worker.js");

  hkToggle.onPress = function () {
    if (hkToggle.val) {
      bkkToggle.val = false;
      gui.loadStyle("TerminalMagenta");
      showElements();
      sendMessage({
        currentCity: "HKG",
      }); // Send city change to showcase
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendMessage({
        currentCity: "None",
      });
    }
  };

  bkkToggle.onPress = function () {
    if (bkkToggle.val) {
      hkToggle.val = false;
      gui.loadStyle("TerminalBlue");
      showElements();
      sendMessage({
        currentCity: "BKK",
      });
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendMessage({
        currentCity: "None",
      });
    }
  };
}

function draw() {
  background(0);
  drawGui();
  gui.setTextSize(32);

  if (volSlider.isChanged) {
    let volume = map(volSlider.val, -100, 100, 0, 1); // normalize volume to 0.0 - 1.0
    sendMessage({
      bgmVolume: volume,
    });
  }

  if (timeSlider.isChanged) {
    let time = map(timeSlider.val, 0, 100, 0, 1); // normalize time to 0.0 - 1.0
    sendMessage({
      time: time,
    });
  }

  // Check for changes in pollutant toggles or sliders
  for (let label of labels) {
    if (toggles[label].isChanged || sliders[label].isChanged) {
      // Create a pollutant data object
      const pollutantData = {
        pollutants: {}
      };

      // Collect current state of ALL pollutants (not just the changed one)
      // This ensures we always send complete pollutant state
      for (let pollutant of labels) {
        pollutantData.pollutants[pollutant] = {
          active: toggles[pollutant].val,
          level: 0.5, // default level of pollution, you can change this to any value between 0 and 1
          volume: map(sliders[pollutant].val, 0, 100, 0, 1) // map slider value to volume
        };
      }

      // Send the complete pollutant data
      sendMessage(pollutantData);

      // Exit the loop after sending (to avoid multiple sends in one frame)
      break;
    }
  }
}

function initElements() {
  let w = width;
  let h = height;

  hkToggle = createToggle("Hong Kong", w * 0.05, h * 0.85, w * 0.4, h * 0.1);
  bkkToggle = createToggle("Bangkok", w * 0.55, h * 0.85, w * 0.4, h * 0.1);

  volSlider = createSliderV(
    "Volume",
    w * 0.9,
    h * 0.05,
    w * 0.05,
    h * 0.7,
    -100,
    100
  );
  timeSlider = createSliderV(
    "Time",
    w * 0.8,
    h * 0.05,
    w * 0.05,
    h * 0.7,
    0,
    100
  );

  let elementSize = w * 0.14;
  let padding = w * 0.13;
  let numCols = 3;
  let numRows = ceil(labels.length / numCols);

  for (let i = 0; i < labels.length; i++) {
    let label = labels[i];
    let row = floor(i / numCols);
    let col = i % numCols;
    let x = w * 0.05 + col * (elementSize + padding);
    let y = h * 0.05 + row * (elementSize + padding);

    toggles[label] = createToggle(label, x, y, elementSize, elementSize);
    sliders[label] = createSlider(
      label,
      x,
      y + elementSize + padding / 5,
      elementSize,
      elementSize / 3,
      0,
      100
    );
  }
}

function windowResized() {
  // Adjust canvas size if needed
  resizeCanvas(windowWidth, windowHeight);

  // Reposition the canvas on window resize
  var x = (windowWidth - sketchCanvas.width) / 2;
  var y = (windowHeight - sketchCanvas.height) / 2;
  sketchCanvas.position(x, y);

  // Reinitialize elements if required
  initElements();
  const canvasDiv = document.getElementById("ctrlCanvas");
  const width = canvasDiv.offsetWidth;
  const height = canvasDiv.offsetHeight;
  resizeCanvas(width, height);
  centerCanvas();
  initElements();
}


function hideElements() {
  for (let label of labels) {
    toggles[label].visible = false;
    sliders[label].visible = false;
  }
  timeSlider.visible = false;
  volSlider.visible = false;
}

function showElements() {
  for (let label of labels) {
    toggles[label].visible = true;
    sliders[label].visible = true;
  }
  timeSlider.visible = true;
  volSlider.visible = true;
}

function touchMoved() {
  return false;
}

function setupCanvas() {

  const width = 917;
  const height = 688;

  sketchCanvas = createCanvas(width, height); // Assign to global variable
  sketchCanvas.parent("ctrlCanvas");

  var x = (windowWidth - width) / 2;
  var y = (windowHeight - height) / 2;
  sketchCanvas.position(x, y);
}

function windowResized() {
  sketchCanvas = createCanvas(width, height);
  var x = (windowWidth - width) / 2;
  var y = (windowHeight - height) / 2;
  sketchCanvas.position(x, y);
}
