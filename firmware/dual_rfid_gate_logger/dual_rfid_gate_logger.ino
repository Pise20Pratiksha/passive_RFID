// ============================================================
//  DUAL RFID GATE LOGGER  (with WiFi AP + Local App API)
//  Hardware : ESP32
//             + 2× CF000749 UHF modules (IN / OUT)
//             + DS3231 RTC (I²C)
//             + ILI9341 TFT (SPI)
//
//  Serial commands (115200 baud):
//    d  → dump all stored records
//    c  → clear / erase all records
//    s  → show buffer stats
//    t  → set RTC time  (then send: DD/MM/YYYY HH:MM:SS)
//
//  WiFi (Access Point) — connect your phone/PC/app to this:
//    SSID:     GateLogger
//    Password: logger123
//    ESP32 IP: 192.168.4.1
//
//  HTTP JSON API (poll from your app):
//    GET http://192.168.4.1/dump    -> all stored records as JSON
//    GET http://192.168.4.1/stats   -> counters as JSON
//    GET http://192.168.4.1/clear   -> clears all records
//
//  Live push (real-time, no polling needed):
//    Open a raw TCP socket to 192.168.4.1 : 8080
//    Every time a tag is detected, one JSON line is pushed to
//    every connected socket, e.g.:
//    {"event":"detection","epc":"E2000...","date":"13/07/2026","time":"10:15:02","dir":"IN"}
// ============================================================

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <SPI.h>
#include <HardwareSerial.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Wire.h>
#include <RTClib.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>

// ─────────────────────────────────────────────────────────────
//  DEBUG
// ─────────────────────────────────────────────────────────────
#define DEBUG 1
#if DEBUG
  #define DBG(x)   Serial.print(x)
  #define DBGLN(x) Serial.println(x)
#else
  #define DBG(x)
  #define DBGLN(x)
#endif


struct TagRecord;

// ─────────────────────────────────────────────────────────────
//  PIN DEFINITIONS
// ─────────────────────────────────────────────────────────────
#define TFT_CS   5
#define TFT_DC   2
#define TFT_RST  4

#define UHF_IN_RX  16
#define UHF_IN_TX  17
#define UHF_OUT_RX 25
#define UHF_OUT_TX 26

// ─────────────────────────────────────────────────────────────
//  TUNING
// ─────────────────────────────────────────────────────────────
const byte          TX_POWER_DBM = 30;
const unsigned long INVENTORY_MS = 600;
const unsigned long DEDUP_MS     = 300000UL;

// ─────────────────────────────────────────────────────────────
//  WIFI AP + LOCAL APP API & MQTT CONFIGURATION
// ─────────────────────────────────────────────────────────────
const char* AP_SSID = "GateLogger";
const char* AP_PASS = "logger123";      // WPA2 needs >= 8 chars
IPAddress   AP_IP(192, 168, 4, 1);
IPAddress   AP_GATEWAY(192, 168, 4, 1);
IPAddress   AP_SUBNET(255, 255, 255, 0);

// Wifi credentials for office Wi-Fi connection
const char* WIFI_SSID = "spjetpl";
const char* WIFI_PASS = "spjetplpune123";

// Desktop LAN IP hosting the web application
const char* LAPTOP_IP   = "192.168.1.100"; // Replace with desktop's current LAN IP
const int   LAPTOP_PORT = 8080;

WebServer server(80);

#define MAX_TCP_CLIENTS 4
WiFiServer tcpServer(8080);
WiFiClient tcpClients[MAX_TCP_CLIENTS];

String apIPString = "192.168.4.1";

// ─────────────────────────────────────────────────────────────
//  NVS CIRCULAR BUFFER
// ─────────────────────────────────────────────────────────────
#define MAX_RECORDS   500
#define NVS_NAMESPACE "rfidlog"

Preferences nvs;
uint32_t nvsHead  = 0;
uint32_t nvsTail  = 0;
uint32_t nvsCount = 0;

#define REC_KEY_LEN 12

void nvsKeyForIndex(uint32_t idx, char* buf) {
  snprintf(buf, REC_KEY_LEN, "rec_%04lu", (unsigned long)(idx % MAX_RECORDS));
}

void nvsLoadMeta() {
  nvs.begin(NVS_NAMESPACE, false);
  nvsHead  = nvs.getUInt("head",  0);
  nvsTail  = nvs.getUInt("tail",  0);
  nvsCount = nvs.getUInt("count", 0);
  nvs.end();
  DBG("NVS loaded — count="); DBGLN(nvsCount);
}

void nvsSaveMeta() {
  nvs.begin(NVS_NAMESPACE, false);
  nvs.putUInt("head",  nvsHead);
  nvs.putUInt("tail",  nvsTail);
  nvs.putUInt("count", nvsCount);
  nvs.end();
}

void nvsWriteRecord(const String& epc,
                    const String& date,
                    const String& time,
                    const char*   direction) {
  char key[REC_KEY_LEN];
  nvsKeyForIndex(nvsHead, key);
  String rec = epc + "," + date + "," + time + "," + direction;
  nvs.begin(NVS_NAMESPACE, false);
  nvs.putString(key, rec);
  nvs.end();
  nvsHead = (nvsHead + 1) % MAX_RECORDS;
  if (nvsCount < MAX_RECORDS) {
    nvsCount++;
  } else {
    nvsTail = (nvsTail + 1) % MAX_RECORDS;
  }
  nvsSaveMeta();
  DBG("NVS wrote ["); DBG(key); DBG("]: "); DBGLN(rec);
}

String nvsReadRecord(uint32_t pos) {
  if (pos >= nvsCount) return "";
  uint32_t idx = (nvsTail + pos) % MAX_RECORDS;
  char key[REC_KEY_LEN];
  nvsKeyForIndex(idx, key);
  nvs.begin(NVS_NAMESPACE, true);
  String rec = nvs.getString(key, "");
  nvs.end();
  return rec;
}

void nvsClearAll() {
  nvs.begin(NVS_NAMESPACE, false);
  nvs.clear();
  nvs.end();
  nvsHead = nvsTail = nvsCount = 0;
  DBGLN("NVS cleared.");
}

// ─────────────────────────────────────────────────────────────
//  DEDUP TABLE
// ─────────────────────────────────────────────────────────────
#define MAX_TAGS 20

struct TagRecord {
  String        epc;
  unsigned long lastSeen;
};

TagRecord seenTagsIN[MAX_TAGS];
int       seenTagCountIN  = 0;
TagRecord seenTagsOUT[MAX_TAGS];
int       seenTagCountOUT = 0;

bool isNewTag(const String& epc, TagRecord* table, int& count) {
  unsigned long now = millis();
  for (int i = 0; i < count; i++) {
    if (table[i].epc == epc) {
      if (now - table[i].lastSeen < DEDUP_MS) return false;
      table[i].lastSeen = now;
      return true;
    }
  }
  if (count < MAX_TAGS) {
    table[count].epc      = epc;
    table[count].lastSeen = now;
    count++;
  } else {
    int oldest = 0;
    for (int i = 1; i < MAX_TAGS; i++)
      if (table[i].lastSeen < table[oldest].lastSeen) oldest = i;
    table[oldest].epc      = epc;
    table[oldest].lastSeen = now;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
//  OBJECTS
// ─────────────────────────────────────────────────────────────
Adafruit_ILI9341 tft    = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);
HardwareSerial   uhfIN(2);
HardwareSerial   uhfOUT(1);
RTC_DS3231       rtc;

// ─────────────────────────────────────────────────────────────
//  GLOBALS
//  NOTE: idleDrawn is REMOVED. showIdleScreen() manages its
//        own state internally via static variables.
// ─────────────────────────────────────────────────────────────
int  totalDetect        = 0;
bool tagScreenActive    = false;   // true while tag screen is showing
bool idleNeedsFullRedraw = false;  // set true when returning from tag screen

// ─────────────────────────────────────────────────────────────
//  CRC16
// ─────────────────────────────────────────────────────────────
unsigned int crc16(byte* p, unsigned int len) {
  unsigned int crc = 0xFFFF;
  for (unsigned int i = 0; i < len; i++) {
    crc ^= p[i];
    for (byte j = 0; j < 8; j++)
      crc = (crc & 1) ? (crc >> 1) ^ 0x8408 : (crc >> 1);
  }
  return crc;
}

// ─────────────────────────────────────────────────────────────
//  UHF COMMANDS
// ─────────────────────────────────────────────────────────────
void sendCmd(HardwareSerial& port, byte* cmd, byte len) {
  unsigned int c = crc16(cmd, len);
  port.write(cmd, len);
  port.write((c >> 8) & 0xFF);
  port.write(c & 0xFF);
}

void flushPort(HardwareSerial& port) {
  delay(20);
  while (port.available()) port.read();
}

void setTxPower(HardwareSerial& port, byte dBm) {
  if (dBm < 26) dBm = 26;
  if (dBm > 30) dBm = 30;
  unsigned int val = (unsigned int)dBm * 100;
  byte cmd[] = {
    0xCF, 0xFF, 0x00, 0x06, 0x04,
    0x00, 0x00, 0x00, 0x00,
    (byte)(val & 0xFF), (byte)(val >> 8)
  };
  sendCmd(port, cmd, sizeof(cmd));
  delay(150);
  flushPort(port);
}

void sendInventory(HardwareSerial& port) {
  byte cmd[] = {0xCF, 0xFF, 0x00, 0x01, 0x05,
                0x00, 0x00, 0x00, 0x00, 0x00};
  sendCmd(port, cmd, sizeof(cmd));
}

void sendStopInventory(HardwareSerial& port) {
  byte cmd[] = {0xCF, 0xFF, 0x00, 0x02, 0x00};
  sendCmd(port, cmd, sizeof(cmd));
}

// ─────────────────────────────────────────────────────────────
//  READ ONE EPC FRAME
// ─────────────────────────────────────────────────────────────
String readOneEPCFrame(HardwareSerial& port, unsigned long windowEndMs) {
  while (millis() < windowEndMs) {
    if (!port.available()) continue;
    if (port.peek() != 0xCF) { port.read(); continue; }

    byte h[5];
    bool headerOK = true;
    for (int i = 0; i < 5; i++) {
      unsigned long bw = millis();
      while (!port.available() && millis() - bw < 50);
      if (!port.available()) { headerOK = false; break; }
      h[i] = port.read();
    }
    if (!headerOK) continue;

    byte frameLen = h[4];
    byte total    = frameLen + 7;
    if (total > 128) continue;

    byte f[128];
    memcpy(f, h, 5);
    bool bodyOK = true;
    for (int i = 5; i < total; i++) {
      unsigned long bw = millis();
      while (!port.available() && millis() - bw < 200);
      if (!port.available()) { bodyOK = false; break; }
      f[i] = port.read();
    }
    if (!bodyOK) continue;

    unsigned int calc = crc16(f, total - 2);
    unsigned int recv = ((unsigned int)f[total-2] << 8) | f[total-1];
    if (calc != recv) continue;
    if (f[3] != 0x01) continue;

    byte epcLen = f[10];
    if (epcLen == 0 || epcLen > 32) continue;

    String epc = "";
    for (int i = 0; i < epcLen; i++) {
      if (f[11+i] < 0x10) epc += "0";
      epc += String(f[11+i], HEX);
    }
    epc.toUpperCase();
    return epc;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────
//  INVENTORY BURST
// ─────────────────────────────────────────────────────────────
String runInventoryBurst(HardwareSerial& port) {
  flushPort(port);
  sendInventory(port);
  unsigned long windowEnd = millis() + INVENTORY_MS;
  String epc = readOneEPCFrame(port, windowEnd);
  sendStopInventory(port);
  unsigned long st = millis();
  while (millis() - st < 80)
    if (port.available()) port.read();
  return epc;
}

// ─────────────────────────────────────────────────────────────
//  RTC HELPERS
// ─────────────────────────────────────────────────────────────
String getDateString() {
  DateTime now = rtc.now();
  char buf[12];
  snprintf(buf, sizeof(buf), "%02d/%02d/%04d",
           now.day(), now.month(), now.year());
  return String(buf);
}

String getTimeString() {
  DateTime now = rtc.now();
  char buf[10];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
           now.hour(), now.minute(), now.second());
  return String(buf);
}

// ─────────────────────────────────────────────────────────────
//  RTC SET via Serial
//  Send 't' then immediately send: DD/MM/YYYY HH:MM:SS
//  Example: 16/05/2026 14:30:00
// ─────────────────────────────────────────────────────────────
void handleRTCSet() {
  // Flush leftover \r\n from Enter keypress
  unsigned long flush = millis();
  while (millis() - flush < 100) {
    if (Serial.available()) Serial.read();
    delay(1);
  }

  Serial.println("Ready. Now send: DD/MM/YYYY HH:MM:SS");
  Serial.println("Example:         16/05/2026 14:30:00");

  // Wait up to 10 seconds
  unsigned long wait = millis();
  while (!Serial.available() && millis() - wait < 10000) delay(10);

  if (!Serial.available()) {
    Serial.println("Timeout. Try again.");
    return;
  }

  String ts = Serial.readStringUntil('\n');
  ts.trim();

  Serial.print("Received: ["); Serial.print(ts);
  Serial.print("] length="); Serial.println(ts.length());

  if (ts.length() < 19) {
    Serial.println("ERROR: Too short. Need DD/MM/YYYY HH:MM:SS");
    return;
  }

  int d  = ts.substring(0,  2).toInt();
  int mo = ts.substring(3,  5).toInt();
  int y  = ts.substring(6,  10).toInt();
  int h  = ts.substring(11, 13).toInt();
  int mi = ts.substring(14, 16).toInt();
  int s  = ts.substring(17, 19).toInt();

  Serial.printf("Parsed: %02d/%02d/%04d %02d:%02d:%02d\n", d, mo, y, h, mi, s);

  if (y < 2020 || y > 2099 ||
      mo < 1   || mo > 12  ||
      d  < 1   || d  > 31  ||
      h  > 23  || mi > 59  || s > 59) {
    Serial.println("ERROR: Invalid values.");
    return;
  }

  // ── Re-init I2C and RTC before writing ──────────────────
  Wire.end();
  delay(50);
  Wire.begin(21, 22);
  delay(50);

  // Check DS3231 is reachable on I2C bus
  Wire.beginTransmission(0x68);   // DS3231 I2C address is always 0x68
  byte err = Wire.endTransmission();
  if (err != 0) {
    Serial.print("ERROR: DS3231 not found on I2C bus. Error code: ");
    Serial.println(err);
    Serial.println("Check SDA=21 SCL=22 wiring and pull-up resistors.");
    return;
  }
  Serial.println("DS3231 found on I2C bus OK.");

  // Re-begin RTC after Wire re-init
  if (!rtc.begin()) {
    Serial.println("ERROR: rtc.begin() failed after Wire re-init.");
    return;
  }

  // Write time using direct register write for reliability
  // DS3231 uses BCD encoding
  auto toBCD = [](int val) -> byte {
    return ((val / 10) << 4) | (val % 10);
  };

  Wire.beginTransmission(0x68);
  Wire.write(0x00);              // start at register 0 (seconds)
  Wire.write(toBCD(s));          // reg 0x00 = seconds
  Wire.write(toBCD(mi));         // reg 0x01 = minutes
  Wire.write(toBCD(h));          // reg 0x02 = hours (24h mode, bit6=0)
  Wire.write(0x01);              // reg 0x03 = day of week (1=Sunday, we set 1)
  Wire.write(toBCD(d));          // reg 0x04 = date
  Wire.write(toBCD(mo));         // reg 0x05 = month
  Wire.write(toBCD(y - 2000));   // reg 0x06 = year (0-99)
  byte writeErr = Wire.endTransmission();

  if (writeErr != 0) {
    Serial.print("ERROR: I2C write failed. Code: ");
    Serial.println(writeErr);
    return;
  }

  Serial.println("Registers written directly via I2C.");

  // ── Verify by reading back ───────────────────────────────
  delay(200);
  DateTime check = rtc.now();
  Serial.printf("RTC verified: %02d/%02d/%04d %02d:%02d:%02d\n",
                check.day(), check.month(), check.year(),
                check.hour(), check.minute(), check.second());

  // Check if verify matches what we wrote (within 2 seconds)
  bool ok = (check.year()   == y  &&
             check.month()  == mo &&
             check.day()    == d  &&
             check.hour()   == h  &&
             check.minute() == mi);

  if (ok) {
    Serial.println("RTC set successfully!");
    idleNeedsFullRedraw = true;
  } else {
    Serial.println("WARNING: Readback mismatch — check I2C wiring.");
    Serial.println("Try adding 4.7k pull-up resistors on SDA and SCL to 3.3V.");
  }
}

// ─────────────────────────────────────────────────────────────
//  WIFI AP + LOCAL APP API  (HTTP + raw TCP live push)
// ─────────────────────────────────────────────────────────────

// Turn "epc,date,time,dir" into a JSON object string
String recordToJSON(const String& rec, uint32_t idx) {
  int c1 = rec.indexOf(',');
  int c2 = rec.indexOf(',', c1 + 1);
  int c3 = rec.indexOf(',', c2 + 1);
  if (c1 < 0 || c2 < 0 || c3 < 0) return "";

  String epc  = rec.substring(0, c1);
  String date = rec.substring(c1 + 1, c2);
  String time = rec.substring(c2 + 1, c3);
  String dir  = rec.substring(c3 + 1);

  String json = "{\"idx\":" + String(idx) +
                ",\"epc\":\""  + epc  + "\"" +
                ",\"date\":\"" + date + "\"" +
                ",\"time\":\"" + time + "\"" +
                ",\"dir\":\""  + dir  + "\"}";
  return json;
}

void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
}

void handleRoot() {
  addCORSHeaders();
  String html =
    "<html><body style='font-family:sans-serif'>"
    "<h2>Vehicle Gate Logger</h2>"
    "<p>Records stored: " + String(nvsCount) + " / " + String(MAX_RECORDS) + "</p>"
    "<p>Total detections: " + String(totalDetect) + "</p>"
    "<ul>"
    "<li><a href='/dump'>/dump</a> — JSON of all stored records</li>"
    "<li><a href='/stats'>/stats</a> — JSON counters</li>"
    "<li><a href='/clear'>/clear</a> — erase all records</li>"
    "</ul>"
    "<p>Live push: open a TCP socket to this device on port 8080 — "
    "one JSON line is sent per detection.</p>"
    "</body></html>";
  server.send(200, "text/html", html);
}

void handleDump() {
  addCORSHeaders();
  String json = "{\"count\":" + String(nvsCount) + ",\"records\":[";
  bool first = true;
  for (uint32_t i = 0; i < nvsCount; i++) {
    String rec = nvsReadRecord(i);
    String rj  = recordToJSON(rec, i);
    if (rj.length() == 0) continue;
    if (!first) json += ",";
    json += rj;
    first = false;
  }
  json += "]}";
  server.send(200, "application/json", json);
}

void handleStats() {
  addCORSHeaders();
  String json = "{\"count\":" + String(nvsCount) +
                ",\"head\":"  + String(nvsHead) +
                ",\"tail\":"  + String(nvsTail) +
                ",\"total\":" + String(totalDetect) +
                ",\"max\":"   + String(MAX_RECORDS) + "}";
  server.send(200, "application/json", json);
}

void handleClear() {
  addCORSHeaders();
  nvsClearAll();
  totalDetect         = 0;
  idleNeedsFullRedraw = true;
  server.send(200, "application/json", "{\"status\":\"cleared\"}");
}

void handleNotFound() {
  addCORSHeaders();
  server.send(404, "application/json", "{\"error\":\"not found\"}");
}

// ─────────────────────────────────────────────────────────────
//  IP REGISTRATION HELPER
// ─────────────────────────────────────────────────────────────
void registerDeviceIP() {
  if (WiFi.status() != WL_CONNECTED) {
    DBGLN("Cannot register IP: WiFi not connected");
    return;
  }

  HTTPClient http;
  String url = "http://" + String(LAPTOP_IP) + ":" + String(LAPTOP_PORT) + "/api/esp-devices/register";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\"ipAddress\":\"" + WiFi.localIP().toString() + "\"}";
  DBG("Registering IP with dashboard: "); DBGLN(url);
  DBG("Payload: "); DBGLN(payload);
  
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    DBG("HTTP Response code: "); DBG(httpResponseCode);
    DBG(" Response: "); DBGLN(response);
  } else {
    DBG("Error on sending POST request: "); DBGLN(httpResponseCode);
  }
  
  http.end();
}

void setupWiFiAndServer() {
  // 1. Initialize softAP (hybrid mode)
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  bool apOK = WiFi.softAP(AP_SSID, AP_PASS);

  if (apOK) {
    DBG("AP started. SSID="); DBG(AP_SSID);
    DBG("  IP="); DBGLN(WiFi.softAPIP().toString());
  } else {
    DBGLN("ERROR: Failed to start WiFi AP!");
  }

  // 2. Connect to Station Wi-Fi
  DBG("Connecting to WiFi SSID: "); DBGLN(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  // Try for 15 seconds (30 attempts * 500ms)
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    DBG(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    apIPString = WiFi.localIP().toString();
    DBG("\nWiFi connected. IP="); DBGLN(apIPString);
    // Register dynamic IP with backend
    registerDeviceIP();
  } else {
    apIPString = WiFi.softAPIP().toString(); // fallback to show AP IP on screen
    DBGLN("\nWiFi connection to office SSID failed!");
  }

  // 3. HTTP Server configuration
  server.on("/",       HTTP_GET, handleRoot);
  server.on("/dump",   HTTP_GET, handleDump);
  server.on("/stats",  HTTP_GET, handleStats);
  server.on("/clear",  HTTP_GET, handleClear);
  server.onNotFound(handleNotFound);
  server.begin();
  DBGLN("HTTP server started on port 80");

  // 4. TCP Server configuration
  tcpServer.begin();
  tcpServer.setNoDelay(true);
  DBGLN("Live-push TCP server started on port 8080");
}

// Accept a new TCP client into a free slot (if any)
void acceptTCPClients() {
  WiFiClient newClient = tcpServer.available();
  if (!newClient) return;

  bool placed = false;
  for (int i = 0; i < MAX_TCP_CLIENTS; i++) {
    if (!tcpClients[i] || !tcpClients[i].connected()) {
      tcpClients[i] = newClient;
      placed = true;
      DBG("Live-push client connected, slot "); DBGLN(i);
      break;
    }
  }
  if (!placed) {
    newClient.stop();  // no free slot — reject
  }
}

// Send a JSON line to every connected live-push client
void broadcastLive(const String& json) {
  for (int i = 0; i < MAX_TCP_CLIENTS; i++) {
    if (tcpClients[i] && tcpClients[i].connected()) {
      tcpClients[i].println(json);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  TFT — IDLE SCREEN
//  Static elements drawn once. Time/date updated every second
//  by erasing only the value rectangle — no flicker.
// ─────────────────────────────────────────────────────────────
void showIdleScreen() {
  static bool staticDrawn = false;
  static int  lastSecond  = -1;

  // ── Reset when returning from tag screen
  if (idleNeedsFullRedraw) {
    staticDrawn         = false;
    lastSecond          = -1;
    idleNeedsFullRedraw = false;
  }

  DateTime now = rtc.now();

  // ── Draw background + labels only once
  if (!staticDrawn) {
    tft.fillScreen(ILI9341_BLACK);

    // Title
    tft.setFont(&FreeSansBold12pt7b);
    tft.setTextColor(ILI9341_CYAN);
    tft.setCursor(20, 50);
    tft.println("VEHICLE GATE LOGGER");

    // Subtitle
    tft.setFont(&FreeSans9pt7b);
    tft.setTextColor(ILI9341_WHITE);
    tft.setCursor(55, 85);
    tft.println("Scanning IN / OUT...");

    // Static labels — positions must match value fillRect() below
    tft.setFont(&FreeSans9pt7b);
    tft.setTextColor(ILI9341_DARKGREY);
    tft.setCursor(10, 120);  tft.print("Time:");
    tft.setCursor(10, 145);  tft.print("Date:");
    tft.setCursor(10, 170);  tft.print("Total:");
    tft.setCursor(10, 192);  tft.print("Records:");
    tft.setCursor(10, 215);  tft.print("IP:");

    staticDrawn = true;
    lastSecond  = -1;   // force immediate value redraw
  }

  // ── Update values every second
  if (now.second() != lastSecond) {
    lastSecond = now.second();

    tft.setFont(&FreeSans9pt7b);

    // Time value — erase rect then redraw
    tft.fillRect(62, 106, 210, 17, ILI9341_BLACK);
    tft.setTextColor(ILI9341_YELLOW);
    tft.setCursor(62, 120);
    tft.print(getTimeString());

    // Date value
    tft.fillRect(62, 131, 210, 17, ILI9341_BLACK);
    tft.setTextColor(ILI9341_YELLOW);
    tft.setCursor(62, 145);
    tft.print(getDateString());

    // Total detections value
    tft.fillRect(68, 156, 160, 17, ILI9341_BLACK);
    tft.setTextColor(ILI9341_GREEN);
    tft.setCursor(68, 170);
    tft.print(totalDetect);

    // Records stored value
    tft.fillRect(90, 178, 160, 17, ILI9341_BLACK);
    tft.setTextColor(ILI9341_GREEN);
    tft.setCursor(90, 192);
    tft.print(nvsCount);
    tft.setTextColor(ILI9341_DARKGREY);
    tft.print(" / ");
    tft.print(MAX_RECORDS);

    // IP address value (AP address — connect your app's WiFi to it)
    tft.fillRect(38, 200, 260, 17, ILI9341_BLACK);
    tft.setTextColor(ILI9341_CYAN);
    tft.setCursor(38, 215);
    tft.print(apIPString);
  }
}

// ─────────────────────────────────────────────────────────────
//  TFT — TAG DETECTED SCREEN
// ─────────────────────────────────────────────────────────────
void showTagScreen(const String& epc,
                   const String& date,
                   const String& time,
                   const char*   direction) {

  tagScreenActive     = true;
  idleNeedsFullRedraw = true;   // idle screen must fully redraw after this

  tft.fillScreen(ILI9341_BLACK);

  bool isIn = (direction[1] == 'N');
  tft.setFont(&FreeSansBold12pt7b);
  tft.setTextColor(isIn ? ILI9341_GREEN : ILI9341_RED);
  tft.setCursor(10, 35);
  tft.print("VEHICLE  ");
  tft.println(direction);

  tft.drawFastHLine(10, 50, 300, ILI9341_DARKGREY);

  tft.setFont(&FreeSans9pt7b);

  tft.setTextColor(ILI9341_DARKGREY);
  tft.setCursor(10, 74);
  tft.println("EPC:");
  tft.setTextColor(ILI9341_CYAN);
  tft.setCursor(10, 94);
  tft.println(epc);

  tft.drawFastHLine(10, 110, 300, ILI9341_DARKGREY);

  tft.setTextColor(ILI9341_DARKGREY);
  tft.setCursor(10, 130);
  tft.print("Date: ");
  tft.setTextColor(ILI9341_WHITE);
  tft.println(date);

  tft.setTextColor(ILI9341_DARKGREY);
  tft.setCursor(10, 155);
  tft.print("Time: ");
  tft.setTextColor(ILI9341_WHITE);
  tft.println(time);

  tft.drawFastHLine(10, 175, 300, ILI9341_DARKGREY);

  tft.setTextColor(ILI9341_DARKGREY);
  tft.setCursor(10, 195);
  tft.print("Records: ");
  tft.setTextColor(ILI9341_WHITE);
  tft.print(nvsCount);
  tft.print(" / ");
  tft.println(MAX_RECORDS);
}

// ─────────────────────────────────────────────────────────────
//  SERIAL DUMP
// ─────────────────────────────────────────────────────────────
void dumpAllRecords() {
  Serial.println("========== NVS RECORD DUMP ==========");
  Serial.print("Total records: "); Serial.println(nvsCount);
  Serial.println("IDX , EPC , DATE , TIME , DIR");
  Serial.println("-------------------------------------");
  for (uint32_t i = 0; i < nvsCount; i++) {
    String rec = nvsReadRecord(i);
    Serial.print(i); Serial.print(" , ");
    Serial.println(rec);
  }
  Serial.println("=====================================");
}

// ─────────────────────────────────────────────────────────────
//  HANDLE ONE TAG DETECTION
// ─────────────────────────────────────────────────────────────
void handleDetection(const String& epc, const char* direction) {
  String date = getDateString();
  String time = getTimeString();

  totalDetect++;
  nvsWriteRecord(epc, date, time, direction);

  DBG("["); DBG(direction); DBG("] ");
  DBG(epc); DBG("  "); DBG(date); DBG("  "); DBGLN(time);

  // Push this detection immediately to any connected local app
  String liveJson = "{\"event\":\"detection\",\"epc\":\"" + epc +
                     "\",\"date\":\"" + date +
                     "\",\"time\":\"" + time +
                     "\",\"dir\":\""  + String(direction) + "\"}";
  broadcastLive(liveJson);

  showTagScreen(epc, date, time, direction);

  // 2-second hold — tag screen visible
  // Keep servicing WiFi/serial/RFID during the hold so nothing stalls
  unsigned long hold = millis() + 2000;
  while (millis() < hold) {
    server.handleClient();
    acceptTCPClients();
    yield();
  }

  tagScreenActive = false;   // tag screen done, loop will call showIdleScreen
}

// ─────────────────────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  DBGLN("=== Dual RFID Gate Logger ===");

  // TFT
  tft.begin();
  tft.setRotation(1);
  tft.fillScreen(ILI9341_BLACK);
  tft.setFont(&FreeSansBold12pt7b);
  tft.setTextColor(ILI9341_CYAN);
  tft.setCursor(60, 120);
  tft.println("Initialising...");

  // RTC
  Wire.begin(21, 22);
  if (!rtc.begin()) {
    DBGLN("ERROR: DS3231 not found!");
    tft.setTextColor(ILI9341_RED);
    tft.setCursor(10, 150);
    tft.println("RTC ERROR!");
  } else {
    if (rtc.lostPower()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
      DBGLN("RTC set to compile time — send 't' to correct it.");
    } else {
      DBGLN("RTC OK — time retained from battery.");
    }
  }
// ── RTC I2C scan
  Wire.begin(21, 22);
  Wire.beginTransmission(0x68);
  byte i2cErr = Wire.endTransmission();
  if (i2cErr != 0) {
    Serial.print("WARNING: DS3231 not responding on I2C. Code=");
    Serial.println(i2cErr);
  } else {
    Serial.println("DS3231 found at 0x68");
  }
  // UHF readers
  uhfIN.begin(115200, SERIAL_8N1, UHF_IN_RX,  UHF_IN_TX);
  uhfOUT.begin(115200, SERIAL_8N1, UHF_OUT_RX, UHF_OUT_TX);
  delay(500);
  DBGLN("UHF UART ready");
  setTxPower(uhfIN,  TX_POWER_DBM);
  setTxPower(uhfOUT, TX_POWER_DBM);

  // NVS
  nvsLoadMeta();

  // WiFi AP + HTTP/TCP servers for local app connectivity
  setupWiFiAndServer();

  showIdleScreen();
  DBGLN("Scanning...");
  DBGLN("Commands: d=dump  c=clear  s=stats  t=set RTC time");
}

// ─────────────────────────────────────────────────────────────
//  MAIN LOOP
// ─────────────────────────────────────────────────────────────
void loop() {

  // ── Service WiFi HTTP API + live-push TCP clients every loop
  server.handleClient();
  acceptTCPClients();

  // ── Serial commands
  // FIX: all cases are inside ONE if(Serial.available()) block
  if (Serial.available()) {
    char cmd = Serial.read();

    if (cmd == 'd' || cmd == 'D') {
      dumpAllRecords();

    } else if (cmd == 'c' || cmd == 'C') {
      nvsClearAll();
      totalDetect         = 0;
      idleNeedsFullRedraw = true;
      DBGLN("Records cleared.");

    } else if (cmd == 's' || cmd == 'S') {
      Serial.print("Count="); Serial.print(nvsCount);
      Serial.print("  Head="); Serial.print(nvsHead);
      Serial.print("  Tail="); Serial.println(nvsTail);

    } else if (cmd == 't' || cmd == 'T') {
      // ── RTC set — FIX: this is now correctly inside the block
      Serial.println("Send datetime: DD/MM/YYYY HH:MM:SS");
      handleRTCSet();
    }
  }

  // ── Scan IN reader
  String epcIN = runInventoryBurst(uhfIN);
  if (epcIN.length() > 0) {
    if (isNewTag(epcIN, seenTagsIN, seenTagCountIN)) {
      handleDetection(epcIN, "IN");
    }
  }

  // ── Scan OUT reader
  String epcOUT = runInventoryBurst(uhfOUT);
  if (epcOUT.length() > 0) {
    if (isNewTag(epcOUT, seenTagsOUT, seenTagCountOUT)) {
      handleDetection(epcOUT, "OUT");
    }
  }

  // ── Always refresh idle screen when tag screen is not active
  // FIX: removed the epcIN/epcOUT length check — clock must update
  //      even when readers detect dedup-blocked tags
  if (!tagScreenActive) {
    showIdleScreen();
  }
}
