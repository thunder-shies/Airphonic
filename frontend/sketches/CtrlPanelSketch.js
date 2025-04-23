const SERVER_ADDRESS = 'wss://airphonic-websockets.onrender.com';
// const SERVER_ADDRESS = 'ws://127.0.0.1:8080'; // Localhost for testing
let socket;
let gui;
let sketchCanvas; // Declare at top for global access
let hkToggle, bkkToggle, timeSlider, volSlider;
let toggles = {}; // Export toggles
let sliders = {};
let labels = ["CO", "O₃", "NO₂", "SO₂", "PM₂.₅", "PM₁₀"];
let volSliderlabel, timeSliderlabel;

function setup() {
  setupCanvas();
  gui = createGui();
  gui.loadStyle("Gray");
  initElements();

  // Initially hide all elements
  hideElements();
  // registerServiceWorker("service-worker.js");
  console.log(`Control Panel: Connecting to WebSocket at ${SERVER_ADDRESS}`);
  try {
    socket = new WebSocket(SERVER_ADDRESS);
    socket.onopen = () => console.log('Control Panel: WebSocket connection opened');
    socket.onerror = (error) => console.error('Control Panel: WebSocket Error: ', error);
    socket.onclose = (event) => console.log(`Control Panel: WebSocket closed. Code: ${event.code}`);
  } catch (e) {
    console.error("Control Panel: Failed to create WebSocket", e);
  }

  hkToggle.onPress = function () {
    if (hkToggle.val) {
      bkkToggle.val = false;
      gui.loadStyle("TerminalMagenta");
      volSliderlabel.setStyle({
        fillBg: color("#000000"),
        fillBgHover: color("#000000"),
        fillBgActive: color("#000000"),
        strokeWeight: 0,
        fillLabel: color("#FFFFFF"),
        fillLabelHover: color("#FFFFFF"),
        fillLabelActive: color("#FFFFFF"),
        textSize: 24,
      });
      timeSliderlabel.setStyle({
        fillBg: color("#000000"),
        fillBgHover: color("#000000"),
        fillBgActive: color("#000000"),
        strokeWeight: 0,
        fillLabel: color("#FFFFFF"),
        fillLabelHover: color("#FFFFFF"),
        fillLabelActive: color("#FFFFFF"),
        textSize: 24,
      });
      showElements();
      sendWebSocketMessage({
        currentCity: "HongKong",
      }); // Send city change to showcase
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendWebSocketMessage({
        currentCity: "None",
      });
    }
  };

  bkkToggle.onPress = function () {
    if (bkkToggle.val) {
      hkToggle.val = false;
      gui.loadStyle("TerminalBlue");
      volSliderlabel.setStyle({
        fillBg: color("#000000"),
        fillBgHover: color("#000000"),
        fillBgActive: color("#000000"),
        strokeWeight: 0,
        fillLabel: color("#FFFFFF"),
        fillLabelHover: color("#FFFFFF"),
        fillLabelActive: color("#FFFFFF"),
        textSize: 24,
      });
      timeSliderlabel.setStyle({
        fillBg: color("#000000"),
        fillBgHover: color("#000000"),
        fillBgActive: color("#000000"),
        strokeWeight: 0,
        fillLabel: color("#FFFFFF"),
        fillLabelHover: color("#FFFFFF"),
        fillLabelActive: color("#FFFFFF"),
        textSize: 24,
      });
      showElements();
      sendWebSocketMessage({
        currentCity: "Bangkok",
      });
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendWebSocketMessage({
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
    console.log("Volume slider changed, calling sendWebSocketMessage with:", { bgmVolume: volume });
    sendWebSocketMessage({
      bgmVolume: volume,
    });
  }

  if (timeSlider.isChanged) {
    let time = map(timeSlider.val, 0, 100, 0, 1); // normalize time to 0.0 - 1.0
    sendWebSocketMessage({
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
          active: toggles[pollutant].val, // If toggle is on, active will be true
          level: 0.5, // Default level of pollution, changeable between 0 and 1
          volume: map(sliders[pollutant].val, 0, 100, 0, 1) // Map slider value to volume
        };
      }

      console.log("Pollutant state changed, calling sendWebSocketMessage with:", pollutantData);
      // Send the complete pollutant data
      sendWebSocketMessage(pollutantData);

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


  volSliderlabel = createButton("Vol", w * 0.89, h * 0.75, 60, 50);
  timeSliderlabel = createButton("Time", w * 0.79, h * 0.75, 60, 50);


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
  volSliderlabel.visible = false;
  timeSliderlabel.visible = false;
}

function showElements() {
  for (let label of labels) {
    toggles[label].visible = true;
    sliders[label].visible = true;
  }
  timeSlider.visible = true;
  volSlider.visible = true;
  volSliderlabel.visible = true;
  timeSliderlabel.visible = true;
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

function sendWebSocketMessage(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("Control Panel: Attempting to send:", data); // <-- Add this log
    try {
      const messageString = JSON.stringify(data);
      socket.send(messageString);
      console.log("Control Panel: Sent OK:", messageString); // <-- Add this log
    } catch (error) {
      console.error("Control Panel: Error sending message:", error);
    }
  } else {
    console.warn(`Control Panel: WebSocket not open (State: ${socket ? socket.readyState : 'null'}). Message not sent:`, data);
  }
}
