/*
 * ESP32-S3 Smart Socket Firmware — MQTT Edition v2.0
 * 
 * Features:
 *   - MQTT telemetry + heartbeat to HiveMQ Cloud (TLS)
 *   - Relay commands from backend
 *   - RFID scan → backend auth → session start/stop
 *   - LCD state machine: Boot → WiFi → Idle → Session → Summary → Idle
 *   - Sensor health monitoring with LCD warnings
 *   - Temperature safety override at 40°C
 *   - Session timer with NVS persistence
 *   - Node online heartbeat every 10s
 *
 * Hardware: PZEM-004T, DS18B20, MFRC522, Relay, hd44780 I2C LCD 20x4
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <PZEM004Tv30.h>
#include <time.h>

// ============================================================
// CONFIGURATION
// ============================================================
#define WIFI_SSID         "Om"
#define WIFI_PASS         "om12345678"

#define MQTT_HOST         "56ea5e16974f414b87f83e18ff65c823.s1.eu.hivemq.cloud"
#define MQTT_PORT         8883
#define MQTT_USER         "Smartsocket"
#define MQTT_PASS         "Suraj@99LABS#"

#define NODE_ID           "node-001"

// PIN MAP
#define RELAY_PIN         5
#define RELAY_ACTIVE_LOW  true
#define SS_PIN            38
#define SCK_PIN           47
#define MOSI_PIN          40
#define MISO_PIN          41
#define RST_PIN           2

#define PZEM_RX_PIN       18
#define PZEM_TX_PIN       17
#define DS18B20_PIN       19
#define I2C_SCL_PIN       9
#define I2C_SDA_PIN       8

// CONSTANTS
#define WDT_TIMEOUT_SECONDS   8
#define TEMP_LIMIT            40.0f
#define TEMP_HYSTERESIS       2.0f
#define COST_PER_UNIT         8.50f
#define TELEMETRY_INTERVAL    2000
#define HEARTBEAT_INTERVAL    10000
#define SENSOR_READ_INTERVAL  1500
#define MQTT_RECONNECT_DELAY  5000
#define NTP_SERVER            "pool.ntp.org"
#define TIMEZONE              "IST-5:30"

// MQTT TOPICS
static const String T_TELEMETRY = "alm/node/" NODE_ID "/telemetry";
static const String T_COMMAND   = "alm/node/" NODE_ID "/command";
static const String T_RFID      = "alm/node/" NODE_ID "/rfid";
static const String T_HEARTBEAT = "alm/node/" NODE_ID "/heartbeat";

// ============================================================
// GLOBAL OBJECTS
// ============================================================
WiFiClientSecure espClient;
PubSubClient mqtt(espClient);
HardwareSerial pzemSerial(1);
PZEM004Tv30 pzem(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
MFRC522 rfidReader(SS_PIN, RST_PIN);
hd44780_I2Cexp lcd;
Preferences prefs;

// ============================================================
// LCD STATE MACHINE
// ============================================================
enum LcdState {
  LCD_BOOT,           // "Welcome to NinetyNine Labs"
  LCD_WIFI_CONNECT,   // "Connecting to WiFi..."
  LCD_WIFI_STATUS,    // "Connected" or "Offline"
  LCD_IDLE,           // "Please tap RFID card"
  LCD_AUTH_SUCCESS,   // "Welcome <name>" (10s)
  LCD_AUTH_FAIL,      // "Please open dashboard" (10s)
  LCD_SESSION_LIVE,   // Live values during session
  LCD_SESSION_END,    // Summary after session ends (30s)
  LCD_THANKYOU,       // "Thank you for using 99Labs"
  LCD_SENSOR_WARN     // Sensor fault warning
};

LcdState lcdState = LCD_BOOT;
unsigned long lcdStateStart = 0;
String sessionUserName = "";

// ============================================================
// STATE VARIABLES
// ============================================================
bool relayState = false;
bool tempOverride = false;
bool sessionActive = false;

// Sensor readings
float sVoltage = 0, sCurrent = 0, sPower = 0, sEnergy = 0;
float sFrequency = 0, sPowerFactor = 0, sTemperature = 0;

// Sensor health
bool pzemOk = false;
bool ds18b20Ok = false;
bool rfidOk = false;

// Session data
float sessionEnergyStart = 0;
float sessionEnergyEnd = 0;
uint32_t sessionStartMs = 0;
uint32_t sessionDurationSec = 0;
float sessionBill = 0;

// Accumulated timer (persisted)
uint32_t accumulatedSec = 0;
uint32_t timerStartSec = 0;
bool timerRunning = false;

// Timing
unsigned long lastSensorRead = 0;
unsigned long lastTelemetry = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastMqttRetry = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastLcdRefresh = 0;

// ============================================================
// LCD HELPER
// ============================================================
void lcdSetState(LcdState newState) {
  lcdState = newState;
  lcdStateStart = millis();
  lcd.clear();
}

void lcdPrintCenter(int row, const char* text) {
  int len = strlen(text);
  int col = (20 - len) / 2;
  if (col < 0) col = 0;
  lcd.setCursor(col, row);
  lcd.print(text);
}

// ============================================================
// RELAY CONTROL
// ============================================================
void setRelay(bool state) {
  if (state && tempOverride) return;
  relayState = state;
  bool physical = RELAY_ACTIVE_LOW ? !state : state;
  digitalWrite(RELAY_PIN, physical ? HIGH : LOW);

  if (state && !timerRunning) {
    timerStartSec = millis() / 1000;
    timerRunning = true;
  } else if (!state && timerRunning) {
    accumulatedSec += (millis() / 1000) - timerStartSec;
    prefs.begin("app", false);
    prefs.putUInt("timer", accumulatedSec);
    prefs.end();
    timerRunning = false;
  }

  prefs.begin("app", false);
  prefs.putBool("relay", state);
  prefs.end();
}

uint32_t getTotalTimerSec() {
  if (timerRunning) return accumulatedSec + ((millis() / 1000) - timerStartSec);
  return accumulatedSec;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
void startSession(const char* userName) {
  sessionActive = true;
  sessionEnergyStart = sEnergy;
  sessionStartMs = millis();
  sessionUserName = String(userName);
  setRelay(true);

  // Show welcome
  if (strlen(userName) > 0) {
    lcdSetState(LCD_AUTH_SUCCESS);
  } else {
    lcdSetState(LCD_AUTH_FAIL);
  }
}

void endSession() {
  sessionActive = false;
  setRelay(false);
  sessionEnergyEnd = sEnergy;
  sessionDurationSec = (millis() - sessionStartMs) / 1000;
  float consumed = sessionEnergyEnd - sessionEnergyStart;
  if (consumed < 0) consumed = 0;
  sessionBill = consumed * COST_PER_UNIT;
  lcdSetState(LCD_SESSION_END);
}

// ============================================================
// MQTT CALLBACK
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;

  String t = String(topic);
  if (t == T_COMMAND) {
    const char* cmd = doc["relay_state"];
    const char* reason = doc["reason"] | "cloud";

    if (cmd) {
      if (strcmp(cmd, "on") == 0 && !sessionActive) {
        // Backend starting session (e.g., after RFID auth)
        const char* uname = doc["userName"] | "";
        startSession(uname);
      } else if (strcmp(cmd, "off") == 0 && sessionActive) {
        endSession();
      } else {
        // Simple relay toggle without session
        setRelay(strcmp(cmd, "on") == 0);
      }
    }
  }
}

// ============================================================
// MQTT CONNECT
// ============================================================
void connectMqtt() {
  if (mqtt.connected()) return;
  if (millis() - lastMqttRetry < MQTT_RECONNECT_DELAY) return;
  lastMqttRetry = millis();

  String clientId = "esp32-" NODE_ID "-" + String(random(1000, 9999));
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    mqtt.subscribe(T_COMMAND.c_str());
  }
}

// ============================================================
// PUBLISH TELEMETRY
// ============================================================
void publishTelemetry() {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["voltage"]     = pzemOk ? round(sVoltage * 10.0) / 10.0 : 0;
  doc["current"]     = pzemOk ? round(sCurrent * 100.0) / 100.0 : 0;
  doc["power"]       = pzemOk ? round(sPower * 10.0) / 10.0 : 0;
  doc["frequency"]   = pzemOk ? round(sFrequency * 10.0) / 10.0 : 0;
  doc["powerFactor"] = pzemOk ? round(sPowerFactor * 100.0) / 100.0 : 0;
  doc["temperature"] = ds18b20Ok ? round(sTemperature * 10.0) / 10.0 : 0;
  doc["timestamp"]   = (unsigned long)millis();

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(T_TELEMETRY.c_str(), buf);
}

// ============================================================
// PUBLISH HEARTBEAT (keeps node "online" on dashboard)
// ============================================================
void publishHeartbeat() {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["nodeId"] = NODE_ID;
  doc["status"] = tempOverride ? "override" : "online";
  doc["uptime"] = millis() / 1000;
  doc["sensors"]["pzem"] = pzemOk;
  doc["sensors"]["temperature"] = ds18b20Ok;
  doc["sensors"]["rfid"] = rfidOk;
  doc["relay"] = relayState;

  char buf[200];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(T_HEARTBEAT.c_str(), buf);
}

// ============================================================
// READ SENSORS
// ============================================================
void readSensors() {
  if (millis() - lastSensorRead < SENSOR_READ_INTERVAL) return;
  lastSensorRead = millis();

  // DS18B20
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  if (t > -100.0 && t < 125.0) {
    sTemperature = t;
    ds18b20Ok = true;
  } else {
    ds18b20Ok = false;
  }

  // PZEM-004T
  float v = pzem.voltage();
  float c = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();
  float f = pzem.frequency();
  float pf = pzem.pf();

  // If voltage reads valid, PZEM is working
  if (!isnan(v) && v > 0) {
    pzemOk = true;
    sVoltage = v;
    if (!isnan(c)) sCurrent = c;
    if (!isnan(p)) sPower = p;
    if (!isnan(e)) sEnergy = e;
    if (!isnan(f)) sFrequency = f;
    if (!isnan(pf)) sPowerFactor = pf;
  } else {
    pzemOk = false;
  }

  // Temperature safety
  if (ds18b20Ok && sTemperature >= TEMP_LIMIT && !tempOverride) {
    tempOverride = true;
    if (sessionActive) endSession();
    else setRelay(false);
  } else if (tempOverride && ds18b20Ok && sTemperature < (TEMP_LIMIT - TEMP_HYSTERESIS)) {
    tempOverride = false;
  }
}

// ============================================================
// RFID HANDLER
// ============================================================
byte lastUID[4] = {0};
unsigned long lastRfidTime = 0;

void handleRfid() {
  if (!rfidOk) return;
  if (!rfidReader.PICC_IsNewCardPresent() || !rfidReader.PICC_ReadCardSerial()) return;

  unsigned long now = millis();
  bool same = true;
  for (byte i = 0; i < 4; i++)
    if (rfidReader.uid.uidByte[i] != lastUID[i]) same = false;

  if (now - lastRfidTime < (same ? 2500 : 500)) {
    rfidReader.PICC_HaltA();
    rfidReader.PCD_StopCrypto1();
    return;
  }

  // If session is active, RFID tap ends the session
  if (sessionActive) {
    endSession();
  } else {
    // Publish RFID to backend for authentication
    char uid[12];
    snprintf(uid, sizeof(uid), "%02X%02X%02X%02X",
             rfidReader.uid.uidByte[0], rfidReader.uid.uidByte[1],
             rfidReader.uid.uidByte[2], rfidReader.uid.uidByte[3]);

    if (mqtt.connected()) {
      JsonDocument doc;
      doc["uid"] = uid;
      doc["timestamp"] = (unsigned long)millis();
      char buf[128];
      serializeJson(doc, buf, sizeof(buf));
      mqtt.publish(T_RFID.c_str(), buf);
    }
    // LCD shows waiting state briefly
    lcd.clear();
    lcdPrintCenter(1, "Authenticating...");
  }

  memcpy(lastUID, rfidReader.uid.uidByte, 4);
  lastRfidTime = now;
  rfidReader.PICC_HaltA();
  rfidReader.PCD_StopCrypto1();
}

// ============================================================
// LCD STATE MACHINE HANDLER
// ============================================================
void handleLcd() {
  if (millis() - lastLcdRefresh < 500) return;
  lastLcdRefresh = millis();

  unsigned long elapsed = millis() - lcdStateStart;
  char buf[21];

  switch (lcdState) {
    case LCD_BOOT:
      lcdPrintCenter(0, "====================");
      lcdPrintCenter(1, "Welcome to");
      lcdPrintCenter(2, "NinetyNine Labs");
      lcdPrintCenter(3, "====================");
      if (elapsed > 3000) lcdSetState(LCD_WIFI_CONNECT);
      break;

    case LCD_WIFI_CONNECT:
      lcdPrintCenter(1, "Connecting WiFi...");
      if (WiFi.status() == WL_CONNECTED) {
        lcdSetState(LCD_WIFI_STATUS);
      } else if (elapsed > 15000) {
        lcd.clear();
        lcdPrintCenter(1, "WiFi: OFFLINE");
        lcdPrintCenter(2, "Check credentials");
        lcdStateStart = millis();
        lcdState = LCD_WIFI_STATUS;
      }
      break;

    case LCD_WIFI_STATUS:
      if (elapsed < 1) {
        lcd.clear();
        if (WiFi.status() == WL_CONNECTED) {
          lcdPrintCenter(1, "WiFi: Connected");
          lcd.setCursor(0, 2);
          lcd.print("IP:");
          lcd.print(WiFi.localIP().toString().c_str());
        } else {
          lcdPrintCenter(1, "WiFi: OFFLINE");
        }
      }
      if (elapsed > 3000) {
        // Check sensor health before going idle
        if (!pzemOk || !ds18b20Ok || !rfidOk) {
          lcdSetState(LCD_SENSOR_WARN);
        } else {
          lcdSetState(LCD_IDLE);
        }
      }
      break;

    case LCD_SENSOR_WARN:
      lcd.setCursor(0, 0); lcd.print("! SENSOR WARNING !  ");
      if (!pzemOk) {
        lcd.setCursor(0, 1); lcd.print("PZEM: NOT WORKING  ");
      } else {
        lcd.setCursor(0, 1); lcd.print("PZEM: OK            ");
      }
      if (!ds18b20Ok) {
        lcd.setCursor(0, 2); lcd.print("TEMP: NOT WORKING  ");
      } else {
        lcd.setCursor(0, 2); lcd.print("TEMP: OK            ");
      }
      if (!rfidOk) {
        lcd.setCursor(0, 3); lcd.print("RFID: NOT WORKING  ");
      } else {
        lcd.setCursor(0, 3); lcd.print("RFID: OK            ");
      }
      if (elapsed > 5000) lcdSetState(LCD_IDLE);
      break;

    case LCD_IDLE:
      lcdPrintCenter(0, "--- 99Labs Node ---");
      lcdPrintCenter(1, "Status: Ready");
      lcdPrintCenter(2, "Please tap");
      lcdPrintCenter(3, "your RFID card");
      // Show MQTT status on line 0 if not connected
      if (!mqtt.connected()) {
        lcd.setCursor(0, 0);
        lcd.print("MQTT: Reconnecting..");
      }
      break;

    case LCD_AUTH_SUCCESS:
      lcdPrintCenter(0, "*** Welcome ***");
      snprintf(buf, sizeof(buf), "%s", sessionUserName.c_str());
      lcdPrintCenter(1, buf);
      lcdPrintCenter(2, "Session starting...");
      lcdPrintCenter(3, "Charging ON");
      if (elapsed > 10000) lcdSetState(LCD_SESSION_LIVE);
      break;

    case LCD_AUTH_FAIL:
      lcdPrintCenter(0, "Card not registered");
      lcdPrintCenter(1, "Please open the");
      lcdPrintCenter(2, "Dashboard to create");
      lcdPrintCenter(3, "your profile");
      if (elapsed > 10000) lcdSetState(LCD_IDLE);
      break;

    case LCD_SESSION_LIVE: {
      uint32_t sessSec = (millis() - sessionStartMs) / 1000;
      float consumed = sEnergy - sessionEnergyStart;
      if (consumed < 0) consumed = 0;

      snprintf(buf, sizeof(buf), "Session: %02d:%02d:%02d",
               sessSec / 3600, (sessSec % 3600) / 60, sessSec % 60);
      lcd.setCursor(0, 0); lcd.print(buf);

      snprintf(buf, sizeof(buf), "V:%.1f A:%.2f T:%.1f",
               sVoltage, sCurrent, sTemperature);
      lcd.setCursor(0, 1); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Power: %.1f W       ", sPower);
      lcd.setCursor(0, 2); lcd.print(buf);

      snprintf(buf, sizeof(buf), "E:%.3fkWh B:%.1f", consumed, consumed * COST_PER_UNIT);
      lcd.setCursor(0, 3); lcd.print(buf);
      break;
    }

    case LCD_SESSION_END: {
      float consumed = sessionEnergyEnd - sessionEnergyStart;
      if (consumed < 0) consumed = 0;

      lcdPrintCenter(0, "== Session Summary =");
      snprintf(buf, sizeof(buf), "Time: %02d:%02d:%02d",
               sessionDurationSec / 3600, (sessionDurationSec % 3600) / 60,
               sessionDurationSec % 60);
      lcd.setCursor(0, 1); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Energy: %.3f kWh", consumed);
      lcd.setCursor(0, 2); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Bill: Rs. %.2f", sessionBill);
      lcd.setCursor(0, 3); lcd.print(buf);

      if (elapsed > 30000) lcdSetState(LCD_THANKYOU);
      break;
    }

    case LCD_THANKYOU:
      lcdPrintCenter(0, "====================");
      lcdPrintCenter(1, "Thank you for using");
      lcdPrintCenter(2, "NinetyNine Labs!");
      lcdPrintCenter(3, "====================");
      if (elapsed > 5000) lcdSetState(LCD_IDLE);
      break;
  }
}

// ============================================================
// WiFi HANDLER
// ============================================================
void handleWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiRetry < 10000 && lastWifiRetry != 0) return;
  lastWifiRetry = millis();
  WiFi.disconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // Watchdog
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  // Load persisted state
  prefs.begin("app", true);
  relayState = prefs.getBool("relay", false);
  accumulatedSec = prefs.getUInt("timer", 0);
  prefs.end();

  // Relay init
  pinMode(RELAY_PIN, OUTPUT);
  bool physical = RELAY_ACTIVE_LOW ? !relayState : relayState;
  digitalWrite(RELAY_PIN, physical ? HIGH : LOW);
  if (relayState) {
    timerStartSec = millis() / 1000;
    timerRunning = true;
  }

  // LCD init
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (lcd.begin(20, 4) == 0) {
    lcd.backlight();
    lcd.clear();
  }
  lcdSetState(LCD_BOOT);

  // Sensors init
  pzemSerial.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  ds18b20.begin();
  ds18b20.setWaitForConversion(false);

  // RFID init
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfidReader.PCD_Init();
  byte ver = rfidReader.PCD_ReadRegister(rfidReader.VersionReg);
  rfidOk = (ver != 0x00 && ver != 0xFF);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(0, 0, NTP_SERVER);
  setenv("TZ", TIMEZONE, 1);
  tzset();

  // MQTT TLS
  espClient.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  esp_task_wdt_reset();

  handleWifi();

  // MQTT
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) connectMqtt();
    mqtt.loop();
  }

  // Sensors
  readSensors();

  // Publish telemetry every 2s
  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL) {
    publishTelemetry();
    lastTelemetry = millis();
  }

  // Publish heartbeat every 10s
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }

  // RFID (only in idle state or session state)
  if (lcdState == LCD_IDLE || lcdState == LCD_SESSION_LIVE) {
    handleRfid();
  }

  // LCD
  handleLcd();
}
