/*
 * ESP32-S3 Smart Socket Firmware — MQTT Edition v3.0
 *
 * Features:
 *   - PZEM-004T energy metering (V, I, P, energy, freq, PF)  [ported from ESP1aLLworking]
 *   - DS18B20 temperature with 40C safety cutoff (38C hysteresis)
 *   - MFRC522 RFID -> backend auth over MQTT
 *   - Single relay (active LOW), NVS-persisted state + accumulated on-time
 *   - MQTT telemetry (short-key schema v,i,p,f,pf,t,ts) + heartbeat to HiveMQ (TLS)
 *   - 20x4 I2C LCD state machine (boot -> wifi -> idle -> auth -> live -> summary -> thankyou)
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
#define WIFI_SSID         "surajverma"
#define WIFI_PASS         "987654321"

#define MQTT_HOST         "56ea5e16974f414b87f83e18ff65c823.s1.eu.hivemq.cloud"
#define MQTT_PORT         8883
#define MQTT_USER         "Smartsocket"
#define MQTT_PASS         "Suraj@99LABS#"

#define NODE_ID           "node-001"

// PIN MAP  (identical to ESP1aLLworking.ino — the known-good wiring)
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
#define AUTH_TIMEOUT_MS       8000
#define WELCOME_MS            10000
#define DASHBOARD_MSG_MS      10000
#define SUMMARY_MS            30000
#define THANKYOU_MS           5000
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
  LCD_WIFI_RESULT,    // "WiFi Connected" / "WiFi Offline"
  LCD_IDLE,           // "Please tap RFID card"
  LCD_AUTHENTICATING, // "Authenticating..." (waiting for backend)
  LCD_WELCOME,        // "Welcome <name>" (10s) -> LIVE
  LCD_DASHBOARD_MSG,  // "Please open dashboard" (10s) -> IDLE
  LCD_LIVE,           // live session values
  LCD_SUMMARY,        // session summary (30s) -> THANKYOU
  LCD_THANKYOU,       // "Thank you for using 99Labs" -> IDLE
  LCD_TEMP_FAULT      // over-temperature warning
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
uint32_t sessionStartMs = 0;
uint32_t sessionDurationSec = 0;   // this session elapsed (s)
uint32_t sessionSocketActiveSec = 0; // accumulated relay-on time snapshot (s)
float sessionEnergyConsumed = 0;   // kWh this session
float sessionBill = 0;             // tariff this session

// Accumulated relay-on timer (persisted across reboots)
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
// LCD HELPERS
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

String fmtHMS(uint32_t s) {
  char b[12];
  snprintf(b, sizeof(b), "%02u:%02u:%02u", s / 3600, (s % 3600) / 60, s % 60);
  return String(b);
}

// ============================================================
// RELAY CONTROL + ACCUMULATED TIMER
// ============================================================
void setRelay(bool state) {
  if (state && tempOverride) return;  // never turn on while over-temp
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
  Serial.printf("[RELAY] %s\n", state ? "ON" : "OFF");
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
  lcdSetState(LCD_WELCOME);
  Serial.printf("[SESSION] Started user='%s'\n", sessionUserName.c_str());
}

void endSession(const char* reason) {
  sessionActive = false;
  setRelay(false);
  sessionDurationSec = (millis() - sessionStartMs) / 1000;
  sessionSocketActiveSec = getTotalTimerSec();
  float consumed = sEnergy - sessionEnergyStart;
  if (consumed < 0 || isnan(consumed)) consumed = 0;
  sessionEnergyConsumed = consumed;
  sessionBill = consumed * COST_PER_UNIT;
  lcdSetState(LCD_SUMMARY);
  Serial.printf("[SESSION] Ended (%s) time=%us energy=%.3fkWh bill=%.2f\n",
                reason, sessionDurationSec, sessionEnergyConsumed, sessionBill);
}

// ============================================================
// MQTT CALLBACK (backend -> node)
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return;

  String t = String(topic);
  if (t != T_COMMAND) return;

  const char* reason = doc["reason"] | "";
  const char* cmd    = doc["relay_state"];
  const char* uname  = doc["userName"] | "";

  Serial.printf("[CMD] relay=%s reason=%s user=%s\n", cmd ? cmd : "(none)", reason, uname);

  // Unknown card -> backend tells us to show the dashboard hint
  if (strcmp(reason, "auth_denied") == 0) {
    lcdSetState(LCD_DASHBOARD_MSG);
    return;
  }

  if (!cmd) return;

  if (strcmp(cmd, "on") == 0) {
    if (!sessionActive) startSession(uname);   // backend authorised -> start session
    else setRelay(true);
  } else if (strcmp(cmd, "off") == 0) {
    if (sessionActive) endSession(reason[0] ? reason : "dashboard");
    else setRelay(false);
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
  Serial.printf("[MQTT] Connecting to %s:%d user=%s id=%s ... ",
                MQTT_HOST, MQTT_PORT, MQTT_USER, clientId.c_str());
  if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.println("CONNECTED");
    mqtt.subscribe(T_COMMAND.c_str());
    Serial.printf("[MQTT] Subscribed to %s\n", T_COMMAND.c_str());
  } else {
    Serial.printf("FAILED, state=%d\n", mqtt.state());
  }
}

// ============================================================
// PUBLISH TELEMETRY  (short-key schema expected by backend parser)
// ============================================================
void publishTelemetry() {
  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["v"]  = round(sVoltage * 10.0) / 10.0;
  doc["i"]  = round(sCurrent * 100.0) / 100.0;
  doc["p"]  = round(sPower * 10.0) / 10.0;
  doc["f"]  = round(sFrequency * 10.0) / 10.0;
  doc["pf"] = round(sPowerFactor * 100.0) / 100.0;
  doc["t"]  = round(sTemperature * 10.0) / 10.0;
  time_t nowSec = time(nullptr);
  doc["ts"] = (nowSec > 100000) ? (unsigned long)nowSec : (unsigned long)(millis() / 1000);

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  bool ok = mqtt.publish(T_TELEMETRY.c_str(), buf);
  Serial.printf("[TELEMETRY] %s (%s)\n", buf, ok ? "sent" : "FAILED");
}

// ============================================================
// PUBLISH HEARTBEAT
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
// READ SENSORS  (logic ported from ESP1aLLworking.ino)
// ============================================================
void readSensors() {
  if (millis() - lastSensorRead < SENSOR_READ_INTERVAL) return;
  lastSensorRead = millis();

  // DS18B20 temperature
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  if (t > -100.0 && t < 125.0) {
    sTemperature = t;
    ds18b20Ok = true;
  } else {
    ds18b20Ok = false;
  }

  // PZEM-004T — keep any successful (non-NaN) reading; NaN = comm failure.
  float v = pzem.voltage();
  if (!isnan(v)) { sVoltage = v; pzemOk = true; } else { pzemOk = false; }
  float c = pzem.current();   if (!isnan(c)) sCurrent = c;
  float p = pzem.power();     if (!isnan(p)) sPower = p;
  float e = pzem.energy();    if (!isnan(e)) sEnergy = e;
  float f = pzem.frequency(); if (!isnan(f)) sFrequency = f;
  float pf = pzem.pf();       if (!isnan(pf)) sPowerFactor = pf;

  // Temperature safety override (highest precedence)
  if (ds18b20Ok && sTemperature >= TEMP_LIMIT && !tempOverride) {
    tempOverride = true;
    if (sessionActive) endSession("safety");
    else setRelay(false);
    lcdSetState(LCD_TEMP_FAULT);
  } else if (tempOverride && ds18b20Ok && sTemperature < (TEMP_LIMIT - TEMP_HYSTERESIS)) {
    tempOverride = false;
    if (lcdState == LCD_TEMP_FAULT) lcdSetState(LCD_IDLE);
  }
}

// ============================================================
// RFID HANDLER
// ============================================================
byte lastUID[4] = {0};
unsigned long lastRfidTime = 0;

void publishRfid(const char* uid) {
  if (!mqtt.connected()) return;
  JsonDocument doc;
  doc["uid"] = uid;
  doc["timestamp"] = (unsigned long)millis();
  char buf[128];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(T_RFID.c_str(), buf);
  Serial.printf("[RFID] Published UID %s\n", uid);
}

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

  char uid[12];
  snprintf(uid, sizeof(uid), "%02X%02X%02X%02X",
           rfidReader.uid.uidByte[0], rfidReader.uid.uidByte[1],
           rfidReader.uid.uidByte[2], rfidReader.uid.uidByte[3]);

  if (sessionActive) {
    // Re-tap ends the session locally (fallback stop)
    endSession("rfid");
  } else {
    // Ask the backend to authenticate this card
    publishRfid(uid);
    lcdSetState(LCD_AUTHENTICATING);
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
  if (millis() - lastLcdRefresh < 400) return;
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
      lcdPrintCenter(1, "Connecting to WiFi..");
      if (WiFi.status() == WL_CONNECTED)      lcdSetState(LCD_WIFI_RESULT);
      else if (elapsed > 15000)               lcdSetState(LCD_WIFI_RESULT);
      break;

    case LCD_WIFI_RESULT:
      if (WiFi.status() == WL_CONNECTED) {
        lcdPrintCenter(1, "WiFi Connected");
        lcd.setCursor(0, 2);
        lcd.print("IP:");
        lcd.print(WiFi.localIP().toString().c_str());
      } else {
        lcdPrintCenter(1, "WiFi Offline");
        lcdPrintCenter(2, "Check credentials");
      }
      if (elapsed > 3000) lcdSetState(LCD_IDLE);
      break;

    case LCD_IDLE:
      lcdPrintCenter(0, "--- 99Labs Node ---");
      lcdPrintCenter(1, mqtt.connected() ? "Status: Ready" : "MQTT: Connecting");
      lcdPrintCenter(2, "Please tap");
      lcdPrintCenter(3, "your RFID card");
      break;

    case LCD_AUTHENTICATING:
      lcdPrintCenter(1, "Authenticating...");
      lcdPrintCenter(2, "Please wait");
      if (elapsed > AUTH_TIMEOUT_MS) lcdSetState(LCD_IDLE);
      break;

    case LCD_WELCOME:
      lcdPrintCenter(0, "*** Welcome ***");
      snprintf(buf, sizeof(buf), "%s", sessionUserName.length() ? sessionUserName.c_str() : "Access Granted");
      lcdPrintCenter(1, buf);
      lcdPrintCenter(2, "Session started");
      lcdPrintCenter(3, "Charging ON");
      if (elapsed > WELCOME_MS) lcdSetState(LCD_LIVE);
      break;

    case LCD_DASHBOARD_MSG:
      lcdPrintCenter(0, "Card not registered");
      lcdPrintCenter(1, "Please open the");
      lcdPrintCenter(2, "Dashboard to create");
      lcdPrintCenter(3, "your profile");
      if (elapsed > DASHBOARD_MSG_MS) lcdSetState(LCD_IDLE);
      break;

    case LCD_LIVE: {
      uint32_t sessSec = (millis() - sessionStartMs) / 1000;
      float consumed = sEnergy - sessionEnergyStart;
      if (consumed < 0 || isnan(consumed)) consumed = 0;

      snprintf(buf, sizeof(buf), "Sess:%s T:%2.0fC", fmtHMS(sessSec).c_str(), sTemperature);
      lcd.setCursor(0, 0); lcd.print(buf); lcd.print("   ");

      snprintf(buf, sizeof(buf), "Actv:%s", fmtHMS(getTotalTimerSec()).c_str());
      lcd.setCursor(0, 1); lcd.print(buf); lcd.print("     ");

      snprintf(buf, sizeof(buf), "V:%5.1f I:%5.2fA", sVoltage, sCurrent);
      lcd.setCursor(0, 2); lcd.print(buf); lcd.print("  ");

      snprintf(buf, sizeof(buf), "P:%4.0fW E:%6.3fkWh", sPower, consumed);
      lcd.setCursor(0, 3); lcd.print(buf);
      break;
    }

    case LCD_SUMMARY:
      lcdPrintCenter(0, "== SESSION SUMMARY ==");
      snprintf(buf, sizeof(buf), "Sess:%s", fmtHMS(sessionDurationSec).c_str());
      lcd.setCursor(0, 1); lcd.print(buf);
      snprintf(buf, sizeof(buf), "Actv:%s", fmtHMS(sessionSocketActiveSec).c_str());
      lcd.setCursor(0, 2); lcd.print(buf);
      snprintf(buf, sizeof(buf), "%6.3fkWh Rs.%.2f", sessionEnergyConsumed, sessionBill);
      lcd.setCursor(0, 3); lcd.print(buf);
      if (elapsed > SUMMARY_MS) lcdSetState(LCD_THANKYOU);
      break;

    case LCD_THANKYOU:
      lcdPrintCenter(0, "====================");
      lcdPrintCenter(1, "Thank you for using");
      lcdPrintCenter(2, "99Labs!");
      lcdPrintCenter(3, "====================");
      if (elapsed > THANKYOU_MS) lcdSetState(LCD_IDLE);
      break;

    case LCD_TEMP_FAULT:
      lcd.setCursor(0, 0); lcd.print("!!! WARNING !!!     ");
      lcd.setCursor(0, 1); lcd.print("OVER TEMPERATURE    ");
      snprintf(buf, sizeof(buf), "Temp: %.1f C        ", sTemperature);
      lcd.setCursor(0, 2); lcd.print(buf);
      lcd.setCursor(0, 3); lcd.print("Relay Locked OFF    ");
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
  delay(300);
  Serial.println("\n\n========================================");
  Serial.println("[BOOT] SmartSocket MQTT firmware v3.0");
  Serial.printf("[BOOT] Node ID: %s  WiFi SSID: %s\n", NODE_ID, WIFI_SSID);
  Serial.println("========================================");

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

  // Relay init (pinMode then apply state — matches known-good boot sequence)
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

  // Sensors init (PZEM + DS18B20)
  pzemSerial.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  ds18b20.begin();
  ds18b20.setWaitForConversion(false);

  // RFID init (with one retry if the module does not answer)
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  rfidReader.PCD_Init();
  delay(50);
  byte ver = rfidReader.PCD_ReadRegister(rfidReader.VersionReg);
  if (ver == 0x00 || ver == 0xFF) {
    delay(50);
    rfidReader.PCD_Init();
    delay(50);
    ver = rfidReader.PCD_ReadRegister(rfidReader.VersionReg);
  }
  rfidOk = (ver != 0x00 && ver != 0xFF);
  Serial.printf("[SENSOR] RFID MFRC522 version=0x%02X -> %s\n", ver, rfidOk ? "OK" : "NOT DETECTED");

  // WiFi
  Serial.printf("[WIFI] Connecting to '%s' ...\n", WIFI_SSID);
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

  static bool wifiWasConnected = false;
  bool wifiNow = (WiFi.status() == WL_CONNECTED);
  if (wifiNow && !wifiWasConnected) {
    Serial.printf("[WIFI] Connected. IP=%s RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else if (!wifiNow && wifiWasConnected) {
    Serial.println("[WIFI] Disconnected");
  }
  wifiWasConnected = wifiNow;

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqtt.connected()) connectMqtt();
    mqtt.loop();
  }

  readSensors();

  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL) {
    publishTelemetry();
    lastTelemetry = millis();
  }

  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }

  // RFID active only when idle (tap to start) or live (re-tap to stop)
  if (lcdState == LCD_IDLE || lcdState == LCD_LIVE) {
    handleRfid();
  }

  handleLcd();
}
