# Airphonic

### **Project Summary: Airphonic – Sonifying Air Quality**

**Airphonic** is an interactive web-based application that transforms **real-time air quality data** (e.g., Air Quality Index, Carbon monoxide, Ozone, Nitrogen dioxide, Sulphur dioxide, Respirable and Fine Suspended Particulates) into **dynamic auditory experiences**, fostering awareness and engagement through **data sonification**. It is architected with three main components: **frontend**, **backend**, and **WebSocket server**.

<br>

---

### **Technical Overview**

#### **Frontend**

- **Purpose**: Provides an interactive and visually appealing user interface.
- **Core Features**:
    - **Dynamic Visualization**: Utilizes `p5.js` for engaging visuals and sound effects., CSS, and JavaScript, with libraries like `p5.js` and `p5.sound`.

#### **Backend**

- **Purpose**: Serves as the core data processor, fetching and managing air quality data.
- **Core Features**:
    - **API Integration**: Retrieves air quality data from OpenAQ and IQAir APIs.
    - **Caching and Rate-Limiting**: Optimizes API calls to ensure efficiency and reliability.
    - **Error Handling**: Incorporates retry logic for robust data fetching.
- **Technologies**: Node.js with Express.js, along with middleware like `cors` and `dotenv`.

#### **WebSocket Server**

- **Purpose**: Enables real-time, bidirectional communication between clients.
- **Core Features**:
    - **Broadcasting**: Relays messages received from one client to all other connected clients.
    - **Error Management**
    - **Control Panel**: Allows users to configure settings through an intuitive interface.
    - **Styling**: Implements a responsive design for a seamless user experience.
- **Technologies**: HTML: Handles WebSocket errors gracefully to maintain server stability.
    - **Client Management**: Tracks and manages active WebSocket connections.
- **Technologies**: Node.js with the `ws` WebSocket library.

#### **Key Functionality**

Airphonic creatively translates air quality data into auditory cues:

- **Harmonious sounds** represent clean air, while **dissonant tones** indicate pollution.
- **Real-time updates** ensure users stay informed about air quality changes.
- The WebSocket server facilitates **live interactions** between multiple users, enhancing collaborative experiences.

#### **Deployment:**

- **Frontend** on **GitHub Pages**
- **Backend** on **Render (Node.js API proxy for OpenAQ)**
- **WebSocket server** on **Render**

<br>

---

### **Exhibition & User Interaction**

- Users can **select different locations** and hear how air pollution affects sound.
- **Real-time sonification** makes air quality **tangible and engaging**.
- Future plans include **interactive elements** where users can "clean" the air through movement or sound input.
