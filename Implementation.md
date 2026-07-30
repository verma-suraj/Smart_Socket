# Implementation & Architecture Plan: ESP32-S3 Smart Socket (Phase 1)

## Overview
This document outlines the exact technical architecture and implementation steps required to build the Phase 1 EV Smart Socket system. The system relies on an ESP32-S3 microcontroller, real-time MQTT communication, and a centralized web backend for Adaptive Load Management (ALM).

This plan maps 1-to-1 with the requirements specified in `Requirements.md`.

---

## 1. Hardware Interfacing & Hardware Abstraction Layer (HAL)
The ESP32-S3 firmware must cleanly interface with the following 5 hardware modules:

1. **PZEM-004T v4 (Energy Meter):** 
   - **Protocol:** UART (Hardware Serial, 9600 baud).
   - **Task:** Read Voltage ($V$), Current ($I$), and Active Power ($P = V \times I$).
2. **DS18B20 (Temperature Sensor):**
   - **Protocol:** 1-Wire interface (requires a 4.7kΩ pull-up resistor between Data and 3.3V).
   - **Task:** Continuously monitor temperature. Enforce local 40°C safety cutoff.
3. **RFID RC522 (Card Reader):**
   - **Protocol:** SPI.
   - **Task:** Read card UID upon tap and package into MQTT payload for backend authorization.
4. **Single Channel Relay Module (Socket Control):**
   - **Protocol:** Standard GPIO (Digital Output).
   - **Task:** Drive GPIO LOW (ON) or HIGH (OFF) based on backend MQTT commands or local safety triggers. Default state on boot: HIGH (OFF).
5. **LCD Screen (Local UI Display):**
   - **Protocol:** I2C (typically 16x2 or 20x4 LCD with PCF8574 I2C adapter).
   - **Task:** Display real-time local metrics (Voltage, Current, Temp, Connection Status, and messages like "Scan Card" or "Socket Active").

---

## 2. MQTT Communication Protocol
To guarantee a seamless transition to the Phase 2 CAN bus aggregator, all MQTT topics are structured strictly around unique Node IDs (which will later map directly to CAN arbitration IDs).

* **Broker:** Standard Cloud MQTT Broker (e.g., Mosquitto, EMQX, or HiveMQ).
* **`alm/node/{node_id}/telemetry`** (ESP32 $\rightarrow$ Backend): Publishes periodic JSON payload:
  ```json
  { "v": 230.5, "i": 12.3, "p": 2829.15, "t": 35.2, "ts": 1690001234 }

  