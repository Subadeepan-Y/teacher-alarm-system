// ═══════════════════════════════════════════════════════════════════════════
//  Teacher Alarm System — ESP32 CYD (Cheap Yellow Display) Firmware
//  Single-file consolidation.
//
//  Board: ESP32-2432S028 (ILI9341 + MFRC522 + buzzer)
//  PlatformIO required with these lib_deps:
//    bodmer/TFT_eSPI, miguelbalboa/MFRC522, bblanchon/ArduinoJson, links2004/WebSockets
// ═══════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <MFRC522.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const char* WIFI_SSID = "S24 FE";
const char* WIFI_PASS = "9842256494";

const char* API_HOST = "teacher-alarm-system.vercel.app";
const int   API_PORT = 443;

const char* SUPABASE_URL    = "https://vspjvhbrhtjkgieucoiy.supabase.co";
const char* SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcGp2aGJyaHRqa2dpZXVjb2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjk3ODgsImV4cCI6MjA5ODY0NTc4OH0.HZUxHDUM2_0hDwaQ1M22fIBusrYgLdcpzP9cBABKOBM";
const char* SUPABASE_WS_URL = "wss://vspjvhbrhtjkgieucoiy.supabase.co/realtime/v1/websocket?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcGp2aGJyaHRqa2dpZXVjb2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjk3ODgsImV4cCI6MjA5ODY0NTc4OH0.HZUxHDUM2_0hDwaQ1M22fIBusrYgLdcpzP9cBABKOBM";

const char* TEACHER_ID = "51f64024-c6de-4f60-9aab-438eb60ff83e";
const char* STRUCTURE  = "secondary";

#define TFT_BL   32
#define RFID_SS   5
#define RFID_RST 22
#define BUZZER   33

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════════════════════════

TFT_eSPI tft;
MFRC522  rfid(RFID_SS, RFID_RST);
WebSocketsClient webSocket;

struct PeriodInfo {
  String time;
  String type;
  String subject;
};

struct StatusResponse {
  String day;
  String time;
  bool hasAlarm;
  String alarmMessage;
  PeriodInfo periods[12];
  int periodCount;
};

struct CurrentPeriodResponse {
  String day;
  String serverTime;
  int periodIndex;
  String periodTime;
  String periodType;
  String subject;
  bool isActive;
  bool subjectAssigned;
  int elapsedMinutes;
  bool attendanceRecorded;
  String alarmStatus;
  String alarmMessage;
};

StatusResponse        currentStatus;
CurrentPeriodResponse currentPeriodResp;

unsigned long lastApiCall       = 0;
const  unsigned long API_INTERVAL = 30000;
unsigned long lastPeriodCheck   = 0;
const  unsigned long PERIOD_CHECK_INTERVAL = 3000;

String  prevAlarmStatus = "ok";
unsigned long buzzerStartMs = 0;
int     buzzerDurationMs = 0;
bool    buzzerOn = false;
bool    buzzerPulseToggle = false;
unsigned long lastPulseToggleMs = 0;
String  lastAlarmSubject = "";

// ═══════════════════════════════════════════════════════════════════════════
//  NETWORK
// ═══════════════════════════════════════════════════════════════════════════

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    attempts++;
  }
}

bool isWiFiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP
// ═══════════════════════════════════════════════════════════════════════════

String httpGet(const String& path) {
  WiFiClientSecure client;
  client.setInsecure();
  if (!client.connect(API_HOST, API_PORT)) return "";

  client.print(String("GET ") + path + " HTTP/1.1\r\n" +
               "Host: " + API_HOST + "\r\n" +
               "Connection: close\r\n\r\n");

  while (client.connected() && !client.available()) delay(10);

  String body;
  bool headersDone = false;
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (!headersDone) {
      if (line == "\r") headersDone = true;
      continue;
    }
    body += line;
  }
  client.stop();
  return body;
}

String httpPost(const String& path, const String& jsonBody) {
  WiFiClientSecure client;
  client.setInsecure();
  if (!client.connect(API_HOST, API_PORT)) return "";

  client.print(String("POST ") + path + " HTTP/1.1\r\n" +
               "Host: " + API_HOST + "\r\n" +
               "Content-Type: application/json\r\n" +
               "Content-Length: " + jsonBody.length() + "\r\n" +
               "Connection: close\r\n\r\n" + jsonBody);

  while (client.connected() && !client.available()) delay(10);

  String body;
  bool headersDone = false;
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (!headersDone) {
      if (line == "\r") headersDone = true;
      continue;
    }
    body += line;
  }
  client.stop();
  return body;
}

// ═══════════════════════════════════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════════════════════════════════

bool fetchStatus() {
  String body = httpGet("/api/status?structure=" + String(STRUCTURE));
  if (!body.length()) return false;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  currentStatus.day          = doc["day"].as<String>();
  currentStatus.time         = doc["time"].as<String>();
  currentStatus.hasAlarm     = doc["alarm"] | false;
  currentStatus.alarmMessage = doc["alarm_message"].as<String>();
  currentStatus.periodCount  = 0;

  JsonArray periods = doc["periods"].as<JsonArray>();
  for (JsonObject p : periods) {
    if (currentStatus.periodCount >= 12) break;
    currentStatus.periods[currentStatus.periodCount].time    = p["time"].as<String>();
    currentStatus.periods[currentStatus.periodCount].type    = p["type"].as<String>();
    currentStatus.periods[currentStatus.periodCount].subject = p["subject"].as<String>();
    currentStatus.periodCount++;
  }
  return true;
}

bool fetchCurrentPeriod() {
  String body = httpGet("/api/current-period?structure=" + String(STRUCTURE));
  if (!body.length()) return false;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  currentPeriodResp.day               = doc["day"].as<String>();
  currentPeriodResp.serverTime         = doc["server_time"].as<String>();
  currentPeriodResp.periodIndex        = doc["period_index"] | -1;
  currentPeriodResp.periodTime         = doc["period_time"].as<String>();
  currentPeriodResp.periodType         = doc["period_type"].as<String>();
  currentPeriodResp.subject            = doc["subject"].as<String>();
  currentPeriodResp.isActive           = doc["is_active"] | false;
  currentPeriodResp.subjectAssigned    = doc["subject_assigned"] | false;
  currentPeriodResp.elapsedMinutes     = doc["elapsed_minutes"] | 0;
  currentPeriodResp.attendanceRecorded = doc["attendance_recorded"] | false;
  currentPeriodResp.alarmStatus        = doc["alarm_status"].as<String>();
  currentPeriodResp.alarmMessage       = doc["alarm_message"].as<String>();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

#define BG_COLOR   TFT_BLACK
#define TEXT_COLOR TFT_WHITE
#define DIM_TEXT   TFT_DARKGREY
#define ACCENT     TFT_ORANGE
#define DARK_BG    0x0841

void initDisplay() {
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
}

void drawHeader() {
  tft.fillRect(0, 0, 320, 30, BG_COLOR);
  tft.setTextSize(1);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setCursor(8, 8);
  tft.print(currentStatus.day);
  tft.setCursor(8, 18);
  tft.setTextColor(DIM_TEXT, BG_COLOR);
  tft.print(currentStatus.time);
  tft.setTextColor(ACCENT, BG_COLOR);
  tft.setCursor(220, 8);
  tft.print("Teacher");
  tft.drawFastHLine(0, 30, 320, DARK_BG);
}

void drawSchedule() {
  tft.fillRect(0, 33, 320, 250, BG_COLOR);
  int y = 38;
  tft.setTextSize(1);

  for (int i = 0; i < currentStatus.periodCount; i++) {
    if (y > 290) break;
    const auto& p = currentStatus.periods[i];

    if (p.type == "break") {
      tft.setTextColor(DIM_TEXT, BG_COLOR);
      tft.setCursor(10, y);
      tft.print(p.time);
      tft.setCursor(130, y);
      tft.print("Break");
      y += 18;
      continue;
    }
    if (p.type == "lunch") {
      tft.setTextColor(DIM_TEXT, BG_COLOR);
      tft.setCursor(10, y);
      tft.print(p.time);
      tft.setCursor(130, y);
      tft.print("Lunch");
      y += 18;
      continue;
    }

    bool hasSubject = p.subject && p.subject.length() > 0;
    tft.setTextColor(hasSubject ? TEXT_COLOR : DIM_TEXT, BG_COLOR);
    tft.setCursor(10, y);
    tft.print(p.time);

    if (hasSubject) {
      tft.fillRect(120, y - 2, 190, 16, DARK_BG);
      tft.setTextColor(TEXT_COLOR, DARK_BG);
      tft.setCursor(125, y);
      tft.print(p.subject);
    } else {
      tft.setTextColor(DIM_TEXT, BG_COLOR);
      tft.setCursor(130, y);
      tft.print("Free");
    }
    y += 20;
  }
}

void drawStatusBar() {
  tft.fillRect(0, 305, 320, 15, DARK_BG);
  tft.setTextSize(1);
  if (isWiFiConnected()) {
    tft.setTextColor(TFT_GREEN, DARK_BG);
    tft.setCursor(8, 307);
    tft.print("WiFi OK");
  } else {
    tft.setTextColor(TFT_RED, DARK_BG);
    tft.setCursor(8, 307);
    tft.print("WiFi X");
  }
  if (currentStatus.hasAlarm) {
    tft.setTextColor(TFT_RED, DARK_BG);
    tft.setCursor(240, 307);
    tft.print("ALARM!");
  } else {
    tft.setTextColor(DIM_TEXT, DARK_BG);
    tft.setCursor(240, 307);
    tft.print("Standby");
  }
}

void showOverlay(const char* msg, uint16_t color) {
  tft.fillRect(40, 130, 240, 40, DARK_BG);
  tft.drawRect(40, 130, 240, 40, ACCENT);
  tft.setTextColor(color, DARK_BG);
  tft.setTextSize(2);
  tft.setCursor(60, 142);
  tft.print(msg);
  delay(1500);
  tft.fillRect(40, 130, 240, 40, BG_COLOR);
}

// ═══════════════════════════════════════════════════════════════════════════
//  BUZZER
// ═══════════════════════════════════════════════════════════════════════════

void initBuzzer() {
  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);
}

void startBuzzer(int durationMs, bool continuous = true) {
  buzzerOn = true;
  buzzerStartMs = millis();
  buzzerDurationMs = durationMs;
  if (continuous) digitalWrite(BUZZER, HIGH);
  buzzerPulseToggle = true;
  lastPulseToggleMs = millis();
}

void stopBuzzer() {
  digitalWrite(BUZZER, LOW);
  buzzerOn = false;
}

void buzzerBeep(int durationMs = 80) {
  digitalWrite(BUZZER, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER, LOW);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RFID
// ═══════════════════════════════════════════════════════════════════════════

void initRFID() {
  SPI.begin();
  rfid.PCD_Init();
}

bool readRFID(String& uid) {
  if (!rfid.PICC_IsNewCardPresent()) return false;
  if (!rfid.PICC_ReadCardSerial()) return false;

  uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  REALTIME (Supabase WebSocket)
// ═══════════════════════════════════════════════════════════════════════════

void realtimeCallback(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[RT] Disconnected");
      break;

    case WStype_CONNECTED:
      Serial.println("[RT] Connected");
      webSocket.sendTXT("[null,\"1\",\"realtime:slots\",\"phx_join\",{}]");
      break;

    case WStype_TEXT: {
      String msg = String((char*)payload);
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, msg);
      if (err) break;

      if (doc[3] == "phx_reply") {
        String ref = doc[1].as<String>();
        webSocket.sendTXT("[null,\"" + ref + "\",\"phoenix\",\"heartbeat\",{}]");
      }

      if (doc[3] == "postgres_changes" && doc[2] == "realtime:slots") {
        JsonObject data = doc[4]["data"];
        const char* eventType = data["type"];
        if (strcmp(eventType, "UPDATE") == 0 || strcmp(eventType, "INSERT") == 0) {
          JsonObject record = data["record"];
          String str = record["subject"].as<String>();
          if (str.length() > 0) {
            showOverlay(("Updated: " + str).c_str(), TFT_ORANGE);
          } else {
            showOverlay("Schedule updated", TFT_ORANGE);
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

void initRealtime() {
  webSocket.begin(SUPABASE_WS_URL);
  webSocket.onEvent(realtimeCallback);
  webSocket.setReconnectInterval(5000);
}

void loopRealtime() {
  webSocket.loop();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALARM STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

void handleAlarm() {
  unsigned long nowMs = millis();
  CurrentPeriodResponse& pr = currentPeriodResp;

  if (pr.attendanceRecorded && pr.subjectAssigned) {
    if (prevAlarmStatus != "ok") {
      stopBuzzer();
      prevAlarmStatus = "ok";
      lastAlarmSubject = "";
      drawSchedule();
      Serial.println("[ALARM] Attendance recorded — alarms cleared");
    }
    return;
  }

  if (!pr.isActive || !pr.subjectAssigned || pr.alarmStatus == "ok") {
    if (prevAlarmStatus != "ok") {
      stopBuzzer();
      prevAlarmStatus = "ok";
      lastAlarmSubject = "";
      if (pr.isActive) drawSchedule();
    }
    return;
  }

  String status = pr.alarmStatus;
  String subject = pr.subject;

  if (status == "active" && prevAlarmStatus != "active") {
    prevAlarmStatus = "active";
    lastAlarmSubject = subject;
    startBuzzer(5000, true);
    showOverlay((subject + " - " + pr.periodTime).c_str(), TFT_ORANGE);
    Serial.printf("[ALARM] Period start: %s\n", subject.c_str());
  }

  if (status == "late" && prevAlarmStatus != "late") {
    prevAlarmStatus = "late";
    lastAlarmSubject = subject;
    startBuzzer(10000, true);
    showOverlay(("Late to " + subject + "!").c_str(), TFT_RED);
    Serial.printf("[ALARM] Late: %s\n", subject.c_str());
  }

  if (status == "escalated" && prevAlarmStatus != "escalated") {
    prevAlarmStatus = "escalated";
    lastAlarmSubject = subject;
    startBuzzer(10000, true);
    showOverlay(("Escalated: " + subject).c_str(), TFT_RED);
    Serial.printf("[ALARM] Escalated: %s\n", subject.c_str());
  }

  if (buzzerOn) {
    if (status == "escalated" && nowMs - buzzerStartMs > 10000) {
      if (nowMs - lastPulseToggleMs > 2000) {
        buzzerPulseToggle = !buzzerPulseToggle;
        lastPulseToggleMs = nowMs;
        digitalWrite(BUZZER, buzzerPulseToggle ? HIGH : LOW);
      }
    } else if (status != "escalated" && nowMs - buzzerStartMs >= buzzerDurationMs) {
      stopBuzzer();
      Serial.println("[ALARM] Buzzer stopped");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════

bool markAttendance(const String& tagUid) {
  String json = "{\"uid\":\"" + tagUid + "\",\"teacher_id\":\"" + TEACHER_ID + "\"}";
  String resp = httpPost("/api/attendance", json);
  return resp.indexOf("\"success\":true") >= 0;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);

  initDisplay();
  initRFID();
  initBuzzer();

  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(60, 120);
  tft.print("Connecting...");

  connectWiFi();

  if (isWiFiConnected()) {
    tft.setCursor(60, 150);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.print("Connected!");
  } else {
    tft.setCursor(60, 150);
    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.print("WiFi Failed");
  }

  delay(1000);
  initRealtime();
  Serial.println("[RT] Connecting to Supabase Realtime...");
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════

void loop() {
  loopRealtime();

  unsigned long nowMs = millis();

  if (nowMs - lastPeriodCheck >= PERIOD_CHECK_INTERVAL) {
    lastPeriodCheck = nowMs;
    if (isWiFiConnected() && fetchCurrentPeriod()) {
      handleAlarm();
    }
  }

  if (nowMs - lastApiCall >= API_INTERVAL) {
    lastApiCall = nowMs;
    if (isWiFiConnected()) {
      bool ok = fetchStatus();
      if (ok) {
        drawHeader();
        drawSchedule();
        drawStatusBar();
      }
    }
  }

  String uid;
  if (readRFID(uid)) {
    Serial.print("RFID: ");
    Serial.println(uid);
    buzzerBeep(80);

    if (markAttendance(uid)) {
      showOverlay("Attend OK", TFT_GREEN);
      Serial.println("[RFID] Attendance recorded");
    } else {
      showOverlay("Attend Fail", TFT_RED);
      Serial.println("[RFID] Attendance failed");
    }
    delay(2000);
  }
}
