# MyCar 🏎️💨

MyCar is an experimental, unique application built with **React Native (Expo)** for advanced control of **CaDA** building block vehicles, with a special focus on PC-class models (board identifier `0xFFF0`).

The application completely rejects the standard, closed ecosystem of the official app. It utilizes Reverse-Engineering techniques and the **Connectionless BLE Advertising (Replay Attack)** protocol to force the car to execute desired actions without direct authorized pairing or key exchange.

---

## 🔥 Key Features and Operation Modes

The project has undergone massive evolution and currently features multi-layered navigation guiding the player from the "Garage" to fully autonomous control systems.

### 🎮 Manual Control (D-Pad)

An improved, highly sensitive interface based on discrete presses with built-in BLE _rate-limiter_ bypass. It allows driving the car using classic D-Pad "arrows" with lightning-fast hardware reaction to releasing the virtual brake key.

### 🧩 Autopilot (Block Programming)

An educational and useful instruction queuing system similar to _Scratch_.

- Drag blocks onto the command list and set the injection times of specific packets with millisecond precision (e.g., Drive forward for 2 seconds, turn right for 0.5 sec).
- The interpreter executes the sequence synchronously, creating autonomous vehicle maneuvers.

### 🖌️ Canvas Stylus (Draw Screen / Dead Reckoning)

An innovative, experimental system that reads vectors drawn by a finger on the smartphone (`react-native-svg`), mathematically converting curvatures and slants into activation times for the lateral steering motors and main drive. The entire complex pattern from the screen is reinterpreted into actual driving around the room.

### 🌍 Internationalization (i18n)

The app is fully translated into **English and Polish** (using `react-i18next`). The language switches seamlessly and automatically adapts to the phone's native settings, making it ready for the global market.

### 🛠️ Advanced Developer Tools (DEV Mode Only)

Powerful under-the-hood analytical tools have been built in:

- **BLE Scanner:** Detects nearby CaDA devices and logs raw data packets (Raw Hex).
- **Debug Screen:** A test board for sending manually crafted hexadecimal strings and saving "working patterns".
- These screens are **automatically hidden** in production to avoid cluttering the end-user interface. They are only visible when running the Metro bundler (`__DEV__ === true`).

---

## 🛠️ Architecture and Tech Stack

- **React Native & Expo SDK 54+**
- **Navigation**: `@react-navigation/native-stack` and `bottom-tabs`
- **BLE Transmission (Broadcasting)**: Modified `react-native-ble-advertiser` library. It forces 24-byte packets as `Manufacturer Specific Data` without broadcasting a UUID.
- **BLE Transmission (Receiving)**: `react-native-ble-plx` (used as a `Scanner` component to identify toys over the air and catch MAC addresses).
- **UI/UX**: Custom Dark Mode styled with a glassmorphism interface (neon purples and muted greens). Custom native hardware-rendered boot animation in `SplashScreen.tsx`.

---

## 🚀 How to Run (Developer Guide)

The application uses native libraries (C++/Java) to generate live SVG vector paths and send Bluetooth radio impulses. Therefore, **running it purely in the Expo Go cloud ("dry run") will not work**. You must build a local developer client.

1. Clone the repository:
   ```bash
   git clone https://github.com/MaciejKubon/MyCar.git
   cd MyCar
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Connect an Android developer device via USB and build the app:
   ```bash
   npm run android
   ```
   _(Note: Due to strict Android 12+ permissions, you must accept all Location and "Nearby Devices" prompts on the first launch)._

> **Tip for Wireless Debugging Users (Android 11+):**
> The mDNS service often reports the phone with a space in its name (e.g., `adb-XXX (2)._adb-tls...`). Expo tools have a built-in bug and will throw a `device not found` error if they encounter this space.
> **Solution:** In Developer Options, check the "IP address & Port" tab, connect via hard IP (`adb connect 192.168.1.X:PORT`), and then force the build on it: `npx expo run:android --device 192.168.1.X:PORT`.

---

## 🔬 How it Works Under the Hood (For the Curious)

1. When turned on, the CaDA car passively seeks authorization. The application masquerades as the official phone app (Bypassing the Hash Handshake process).
2. We discovered that the board with Manufacturer ID `0xFFF0` (65520) lacks security measures like rolling codes in its time frame.
3. The command base (`src/utils/commands.ts`) is the original 24-byte injection (Hex Payload) ripped straight from `btsnoop_hci.log` HCI logs. It contains the static session part and the return flag.
4. The code continuously iterates through an interval loop, firing a packet every 100 ms – as long as the finger touches the screen. We shortened the virtual stopping arm by cutting hardware timeouts, resulting in latency reduction of over 50%.

---

_Built with a passion for engineering toys and React Native. Have a great drive!_ 🛣️
