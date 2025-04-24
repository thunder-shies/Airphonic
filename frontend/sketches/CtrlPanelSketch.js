// const SERVER_ADDRESS = 'ws://127.0.0.1:8080'; // Localhost for testing
const SERVER_ADDRESS = 'wss://airphonic-websockets.onrender.com';
let socket;
let gui;
let sketchCanvas;
let hkToggle, bkkToggle, volSlider;
let toggles = {};
let sliders = {};
let labels = ["CO", "O₃", "NO₂", "SO₂", "PM₂.₅", "PM₁₀"];
let volSliderlabel;

// Dynamic sizing
let canvasAspect = 917 / 688;
let ctrlPanelW, ctrlPanelH;

function getResponsiveSize() {
  let margin = 40;
  let minW = 420;  // Minimum canvas width
  let minH = 340;  // Minimum canvas height
  let w = max(windowWidth - margin * 2, minW);
  let h = max(windowHeight - margin * 2, minH);

  if (w / h > canvasAspect) {
    w = h * canvasAspect;
  } else {
    h = w / canvasAspect;
  }
  return { w: round(w), h: round(h) };
}

function setup() {
  // Responsive sizing
  ({ w: ctrlPanelW, h: ctrlPanelH } = getResponsiveSize());
  sketchCanvas = createCanvas(ctrlPanelW, ctrlPanelH);
  sketchCanvas.parent("ctrlCanvas");

  centerCanvas();

  gui = createGui();
  gui.loadStyle("Gray");
  initElements();

  hideElements();

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
      setLabelStyles();
      showElements();
      sendWebSocketMessage({ currentCity: "HongKong" });
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendWebSocketMessage({ currentCity: "None" });
    }
  };

  bkkToggle.onPress = function () {
    if (bkkToggle.val) {
      hkToggle.val = false;
      gui.loadStyle("TerminalBlue");
      setLabelStyles();
      showElements();
      sendWebSocketMessage({ currentCity: "Bangkok" });
    } else {
      hideElements();
      gui.loadStyle("Gray");
      sendWebSocketMessage({ currentCity: "None" });
    }
  };
}

function setLabelStyles() {
  // Use a dynamic text size based on canvas for controls and volume label
  let dynTextSize = max(18, ctrlPanelH * 0.03);

  // Volume slider label
  volSliderlabel.setStyle({
    fillBg: color("#000000"),
    fillBgHover: color("#000000"),
    fillBgActive: color("#000000"),
    strokeWeight: 0,
    fillLabel: color("#FFFFFF"),
    fillLabelHover: color("#FFFFFF"),
    fillLabelActive: color("#FFFFFF"),
    textSize: dynTextSize,
  });

  // Toggle and slider labels
  for (let label of labels) {
    if (toggles[label] && toggles[label].setStyle) {
      toggles[label].setStyle({ textSize: dynTextSize });
    }
    if (sliders[label] && sliders[label].setStyle) {
      sliders[label].setStyle({ textSize: dynTextSize });
    }
  }
}

function draw() {
  background(0);
  drawGui();
  gui.setTextSize(max(24, ctrlPanelH * 0.045)); // Adaptive GUI font

  if (volSlider.isChanged) {
    let volume = map(volSlider.val, -100, 100, 0, 1);
    sendWebSocketMessage({ bgmVolume: volume });
  }

  for (let label of labels) {
    if (toggles[label].isChanged || sliders[label].isChanged) {
      const pollutantData = { pollutants: {} };
      for (let pollutant of labels) {
        pollutantData.pollutants[pollutant] = {
          active: toggles[pollutant].val,
          level: 0.5,
          volume: map(sliders[pollutant].val, 0, 100, 0, 1)
        };
      }
      sendWebSocketMessage(pollutantData);
      break;
    }
  }
}

function initElements() {
  let w = ctrlPanelW;
  let h = ctrlPanelH;

  gui.setTextSize(max(24, ctrlPanelH * 0.045));

  hkToggle = createToggle("Hong Kong", w * 0.05, h * 0.85, w * 0.4, h * 0.1);
  bkkToggle = createToggle("Bangkok", w * 0.55, h * 0.85, w * 0.4, h * 0.1);

  volSlider = createSliderV(
    "Volume",
    w * 0.8,
    h * 0.05,
    w * 0.1,
    h * 0.7,
    -100,
    100
  );

  volSliderlabel = createButton("Vol", w * 0.815, h * 0.78, w * 0.06, h * 0.06);

  // Determine columns based on width
  let minElementSize = 60;
  let minPadding = 15;
  let elementSize = max(minElementSize, w * 0.13);
  let padding = max(minPadding, w * 0.12);

  let numCols = 3;
  if (w < 420) numCols = 2;
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

function centerCanvas() {
  let x = (windowWidth - ctrlPanelW) / 2;
  let y = (windowHeight - ctrlPanelH) / 2;
  sketchCanvas.position(x, y);
}

function hideElements() {
  for (let label of labels) {
    toggles[label].visible = false;
    sliders[label].visible = false;
  }
  volSlider.visible = false;
  volSliderlabel.visible = false;
}

function showElements() {
  for (let label of labels) {
    toggles[label].visible = true;
    sliders[label].visible = true;
  }
  volSlider.visible = true;
  volSliderlabel.visible = true;
}

function touchMoved() {
  return false;
}

function sendWebSocketMessage(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      const messageString = JSON.stringify(data);
      socket.send(messageString);
    } catch (error) {
      console.error("Control Panel: Error sending message:", error);
    }
  } else {
    console.warn(`Control Panel: WebSocket not open (State: ${socket ? socket.readyState : 'null'}). Message not sent:`, data);
  }
}
