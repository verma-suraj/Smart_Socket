///////////////////////////////////////////////////////////////////READ//////////////////////////////////////////////////////////////////////////
/*
   ESP32-S3 DevKitC-1 N16R8 - Production IoT Firmware
   RFID + Sinric + PZEM004Tv3 + DS18B20 + hd44780 I2C LCD + Timer
   Fixed: Exact User Relay Boot Sequence & 3 Decimal Formatting
*/
// ESP 1 CODE 
// TEMP IS NOT INCLUDE BECOZ OF LIMITED DEVICE IN SNRIC 3 WE CAN USE .
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

#include <WiFi.h>
#include <SPI.h>
#include <MFRC522.h>
#include <SinricPro.h>
#include <SinricProSwitch.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <PZEM004Tv30.h>
#include <time.h>

// ==========================================
// SYSTEM CONFIGURATION (AAPKA EXACT DATA)
// ==========================================
#define WIFI_SSID           "Om"
#define WIFI_PASS           "om12345678"

#define APP_KEY             "ef46c476-5de8-4c75-a6fe-6f9462883aa4"
#define APP_SECRET          "670c9ea3-e172-4f83-b926-f844f48f72df-79d01e7e-1733-4619-9e84-7ab036bdfb9a"
#define DEVICE_ID           "6a635ba629c6be33427ea0d6"

#define RELAY_PIN           5      // Aapka pin
#define RELAY_ACTIVE_LOW    true

// RFID CONFIG (Aapka original pins)
#define SS_PIN              38
#define SCK_PIN             47
#define MOSI_PIN            40
#define MISO_PIN            41
#define RST_PIN             2

// HARDWARE ADDITIONS CONFIG
#define PZEM_RX_PIN         18
#define PZEM_TX_PIN         17
#define DS18B20_PIN         19
#define I2C_SCL_PIN         9
#define I2C_SDA_PIN           

// APPLICATION LOGIC CONFIG
#define WDT_TIMEOUT_SECONDS 8
#define TEMP_LIMIT          40.0f
#define COST_PER_UNIT       8.50f
#define NTP_SERVER          "pool.ntp.org"
#define TIMEZONE            "IST-5:30"

// ==========================================
// NAMESPACE: STORAGE (NVS)
// ==========================================
namespace Storage {
Preferences prefs;
const char* PREF_NAMESPACE = "app_data";
const char* KEY_RELAY = "relay_st";
const char* KEY_TIMER = "charge_t";

bool loadRelayState() {
  prefs.begin(PREF_NAMESPACE, true);
  bool state = prefs.getBool(KEY_RELAY, false);
  prefs.end();
  return state;
}

void saveRelayState(bool state) {
  prefs.begin(PREF_NAMESPACE, false);
  prefs.putBool(KEY_RELAY, state);
  prefs.end();
}

uint32_t loadChargeTime() {
  prefs.begin(PREF_NAMESPACE, true);
  uint32_t t = prefs.getUInt(KEY_TIMER, 0);
  prefs.end();
  return t;
}

void saveChargeTime(uint32_t seconds) {
  prefs.begin(PREF_NAMESPACE, false);
  prefs.putUInt(KEY_TIMER, seconds);
  prefs.end();
}
}

// ==========================================
// NAMESPACE: TIME & TIMER MANAGER
// ==========================================
namespace TimeManager {
uint32_t accumulatedSeconds = 0;
uint32_t sessionStartTime = 0;
uint32_t lastFlashSave = 0;
bool isTiming = false;

void init() {
  accumulatedSeconds = Storage::loadChargeTime();
}

void start() {
  sessionStartTime = millis() / 1000;
  isTiming = true;
  lastFlashSave = 0;
}

void stop() {
  if (isTiming) {
    uint32_t sessionDuration = (millis() / 1000) - sessionStartTime;
    accumulatedSeconds += sessionDuration;
    Storage::saveChargeTime(accumulatedSeconds);
    isTiming = false;
  }
}

uint32_t getTotalSeconds() {
  if (isTiming) {
    return accumulatedSeconds + ((millis() / 1000) - sessionStartTime);
  }
  return accumulatedSeconds;
}

String getFormattedTime() {
  uint32_t t = getTotalSeconds();
  char buf[16];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d", t / 3600, (t % 3600) / 60, t % 60);
  return String(buf);
}

void handle() {
  if (isTiming) {
    uint32_t currentSession = (millis() / 1000) - sessionStartTime;
    if (currentSession - lastFlashSave >= 3600) { // Backup timer every 1 hour
      Storage::saveChargeTime(accumulatedSeconds + currentSession);
      lastFlashSave = currentSession;
    }
  }
}
}

// ==========================================
// NAMESPACE: SENSORS (PZEM & DS18B20)
// ==========================================
namespace HardwareSensors {
HardwareSerial pzemSerial(1);
PZEM004Tv30 pzem(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN);

OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

float voltage = 0.0, current = 0.0, power = 0.0, energy = 0.0;
float temperature = 0.0;
bool tempFault = false;
unsigned long lastSensorRead = 0;

void init() {
  pzemSerial.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);
  ds18b20.begin();
  ds18b20.setWaitForConversion(false);
}

namespace RelayProxy {
void forceOffSafety();
}

void handle() {
  if (millis() - lastSensorRead >= 1500) {
    ds18b20.requestTemperatures();
    temperature = ds18b20.getTempCByIndex(0);
    if (temperature <= -100.0) temperature = 0.0;

    float v = pzem.voltage(); if (!isnan(v)) voltage = v;
    float c = pzem.current(); if (!isnan(c)) current = c;
    float p = pzem.power();   if (!isnan(p)) power = p;
    float e = pzem.energy();  if (!isnan(e)) energy = e;

    if (temperature >= TEMP_LIMIT) {
      tempFault = true;
      RelayProxy::forceOffSafety();
    }
    lastSensorRead = millis();
  }
}
}

// ==========================================
// NAMESPACE: RELAY MANAGER (AAPKA EXACT WORKING LOGIC)
// ==========================================
namespace Relay {
bool currentState = false;
bool pendingCloudSync = false;

void applyHardware() {
  bool physicalState = RELAY_ACTIVE_LOW ? !currentState : currentState;
  digitalWrite(RELAY_PIN, physicalState ? HIGH : LOW);
}

void init() {
  // 1. Memory se pichli state read ki
  currentState = Storage::loadRelayState();

  // 2. AAPKA WALA SEQUENCE: Pehle PinMode OUTPUT
  pinMode(RELAY_PIN, OUTPUT);

  // 3. Phir turant usko correct state (HIGH/LOW) bheji
  applyHardware();

  Serial.printf("[RELAY] Boot Complete: Restored to %s\n", currentState ? "ON" : "OFF");

  // Agar on hone se pehle ON tha, toh timer wapas start kar do
  if (currentState) TimeManager::start();

  pendingCloudSync = true;
}

void set(bool newState, const char* source, bool triggerCloudSync) {
  if (newState == true && HardwareSensors::tempFault) {
    if (HardwareSensors::temperature >= TEMP_LIMIT) return; // Heat fault mein ON nahi hoga
    else HardwareSensors::tempFault = false;
  }

  if (currentState == newState) {
    if (triggerCloudSync) pendingCloudSync = true;
    return;
  }

  currentState = newState;
  applyHardware();

  // Timer ON/OFF control
  if (currentState) TimeManager::start();
  else TimeManager::stop();

  Storage::saveRelayState(currentState);
  Serial.printf("[RELAY] Turned %s by %s\n", currentState ? "ON" : "OFF", source);

  if (triggerCloudSync) pendingCloudSync = true;
}
}

void HardwareSensors::RelayProxy::forceOffSafety() {
  if (Relay::currentState) {
    Relay::set(false, "SafetyLimit", true);
  }
}

// ==========================================
// NAMESPACE: DISPLAY (hd44780 I2C LCD)
// ==========================================
namespace Display {
hd44780_I2Cexp lcd;
unsigned long lastRefresh = 0;
unsigned long lastPageSwitch = 0;
int page = 0;

void init() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (lcd.begin(20, 4) == 0) {
    lcd.backlight();
    lcd.clear();
    lcd.print(" System Booting...");
  }
}

void handle() {
  unsigned long now = millis();

  // 6 second baad screen badlegi
  if (now - lastPageSwitch >= 6000) {
    page = (page == 0) ? 1 : 0;
    lcd.clear();
    lastPageSwitch = now;
    lastRefresh = 0;
  }

  // Har 1 second me Live Data refresh hoga
  if (now - lastRefresh >= 1000) {
    if (HardwareSensors::tempFault) {
      lcd.setCursor(0, 0); lcd.print("!!! WARNING !!!     ");
      lcd.setCursor(0, 1); lcd.print("OVER TEMPERATURE    ");
      lcd.setCursor(0, 2); lcd.printf("Temp: %.1f%cC        ", HardwareSensors::temperature, 223);
      lcd.setCursor(0, 3); lcd.print("Relay Locked OFF    ");
    }
    else if (page == 0) {
      // SCREEN 1: MAIN DASHBOARD (3 Decimal Format)
      char buf[21];
      snprintf(buf, sizeof(buf), "V:%-7.3f I:%-6.3f", HardwareSensors::voltage, HardwareSensors::current);
      lcd.setCursor(0, 0); lcd.print(buf);

      snprintf(buf, sizeof(buf), "P:%-8.3f W       ", HardwareSensors::power);
      lcd.setCursor(0, 1); lcd.print(buf);

      snprintf(buf, sizeof(buf), "U:%-6.3f B:%.1f   ", HardwareSensors::energy, (HardwareSensors::energy * COST_PER_UNIT));
      lcd.setCursor(0, 2); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Time:%-8s [%s]", TimeManager::getFormattedTime().c_str(), Relay::currentState ? "ON " : "OFF");
      lcd.setCursor(0, 3); lcd.print(buf);
    }
    else if (page == 1) {
      // SCREEN 2: SYSTEM & CLOCK
      char buf[21];
      snprintf(buf, sizeof(buf), "WiFi: %-14s", WiFi.status() == WL_CONNECTED ? "OK" : "Wait");
      lcd.setCursor(0, 0); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Cloud:%-14s", SinricPro.isConnected() ? "OK" : "Wait");
      lcd.setCursor(0, 1); lcd.print(buf);

      snprintf(buf, sizeof(buf), "Temp: %.1f%cC         ", HardwareSensors::temperature, 223);
      lcd.setCursor(0, 2); lcd.print(buf);

      struct tm t;
      if (getLocalTime(&t, 10)) snprintf(buf, sizeof(buf), "Clk : %02d:%02d:%02d    ", t.tm_hour, t.tm_min, t.tm_sec);
      else snprintf(buf, sizeof(buf), "Clk : Syncing...    ");
      lcd.setCursor(0, 3); lcd.print(buf);
    }
    lastRefresh = now;
  }
}
}

// ==========================================
// NAMESPACE: SERIAL LOGGER (3 Decimals)
// ==========================================
namespace Logger {
unsigned long lastLog = 0;

void handle() {
  if (millis() - lastLog >= 5000) { // Har 5 second baad Serial par print karega
    Serial.println("\n========== LIVE SYSTEM DASHBOARD ==========");
    Serial.printf("Relay Status : %s\n", Relay::currentState ? "ON" : "OFF");
    Serial.printf("Voltage (V)  : %.3f V\n", HardwareSensors::voltage);
    Serial.printf("Current (A)  : %.3f A\n", HardwareSensors::current);
    Serial.printf("Power (W)    : %.3f W\n", HardwareSensors::power);
    Serial.printf("Energy (Unit): %.3f kWh\n", HardwareSensors::energy);
    Serial.printf("Total Bill   : Rs. %.2f\n", (HardwareSensors::energy * COST_PER_UNIT));
    Serial.printf("Charging Time: %s\n", TimeManager::getFormattedTime().c_str());
    Serial.printf("Temperature  : %.1f °C\n", HardwareSensors::temperature);
    Serial.println("===========================================");
    lastLog = millis();
  }
}
}

// ==========================================
// NAMESPACE: APP NETWORK (WiFi & Sinric)
// ==========================================
namespace AppNetwork {
SinricProSwitch &mySwitch = SinricPro[DEVICE_ID];
bool wifiConnected = false;
unsigned long lastWifiRetry = 0;

bool onPowerState(const String &deviceId, bool &state) {
  Relay::set(state, "Sinric", false);
  return true;
}

void init() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  configTime(0, 0, NTP_SERVER);
  setenv("TZ", TIMEZONE, 1); tzset();

  mySwitch.onPowerState(onPowerState);
  SinricPro.onConnected([]() {
    Relay::pendingCloudSync = true;
  });
  SinricPro.restoreDeviceStates(false);
  SinricPro.begin(APP_KEY, APP_SECRET);
}

void handle() {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) wifiConnected = false;
    if (millis() - lastWifiRetry >= 10000 || lastWifiRetry == 0) {
      lastWifiRetry = millis();
      WiFi.disconnect(true);
      WiFi.begin(WIFI_SSID, WIFI_PASS);
    }
  } else {
    if (!wifiConnected) wifiConnected = true;
  }

  SinricPro.handle();

  if (Relay::pendingCloudSync && wifiConnected && SinricPro.isConnected()) {
    mySwitch.sendPowerStateEvent(Relay::currentState);
    Relay::pendingCloudSync = false;
  }
}
}

// ==========================================
// NAMESPACE: RFID MANAGER (AAPKE ORIGINAL CARDS)
// ==========================================
namespace RFID {
MFRC522 reader(SS_PIN, RST_PIN);
bool moduleHealthy = false;

  const byte authCard1[4] = {0x13, 0xA0, 0x33, 0x07};
  const byte authCard2[4] = {0xB1, 0xF9, 0x12, 0x07};

byte lastUID[4] = {0};
unsigned long lastReadTime = 0;

void init() {
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  reader.PCD_Init();
  byte v = reader.PCD_ReadRegister(reader.VersionReg);
  moduleHealthy = (v != 0x00 && v != 0xFF);
}

bool isAuthorized(byte *uid, byte size) {
  if (size != 4) return false;
  bool match1 = true, match2 = true;
  for (byte i = 0; i < 4; i++) {
    if (uid[i] != authCard1[i]) match1 = false;
    if (uid[i] != authCard2[i]) match2 = false;
  }
  return (match1 || match2);
}

void handle() {
  if (!moduleHealthy || !reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;

  unsigned long now = millis();
  bool isSameCard = true;
  for (byte i = 0; i < 4; i++) if (reader.uid.uidByte[i] != lastUID[i]) isSameCard = false;

  if (now - lastReadTime >= (isSameCard ? 2500 : 500)) {
    if (isAuthorized(reader.uid.uidByte, reader.uid.size)) {
      Relay::set(!Relay::currentState, "RFID", true);
    }
    memcpy(lastUID, reader.uid.uidByte, 4);
    lastReadTime = now;
  }
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}
}

// ==========================================
// MAIN ARDUINO HOOKS
// ==========================================
void setup() {
  Serial.begin(115200);

  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
  esp_task_wdt_add(NULL);

  TimeManager::init();
  Relay::init();
  HardwareSensors::init();
  Display::init();
  AppNetwork::init();
  RFID::init();
}

void loop() {
  esp_task_wdt_reset();

  AppNetwork::handle();
  HardwareSensors::handle();
  RFID::handle();
  TimeManager::handle();
  Display::handle();
  Logger::handle();
}
