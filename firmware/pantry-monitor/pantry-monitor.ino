/**
 * Smart Pantry System - Phase 5 ESP32 + Sensor Firmware
 * Microcontroller: ESP32 DevKit / NodeMCU
 * Sensors:
 *   - Load Cell via HX711 Amplifier (DT: GPIO 4, SCK: GPIO 5)
 *   - DHT22 Temperature & Humidity Sensor (DATA: GPIO 15)
 * Telemetry Pipeline: ESP32 -> Wi-Fi -> Trusted Ingestion Endpoint -> Firestore -> React UI
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <DHT.h>
#include "HX711.h"
#include <ArduinoJson.h>

#include "config.h"
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #include "secrets.example.h"
#endif

// Sensor instances
HX711 scale;
DHT dht(DHT_PIN, DHT_TYPE);

// State tracking
unsigned long lastSampleTime = 0;
unsigned long lastDHTReadTime = 0;
unsigned long sequenceCounter = 0;
float cachedTemperature = 0.0f;
float cachedHumidity = 0.0f;
bool isHX711Ready = false;
bool isDHTReady = false;

// NTP Time configuration
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 0;
const int daylightOffset_sec = 0;

void setupWiFi() {
  Serial.println("\n[WiFi] Connecting to network...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_MAX_RETRY_ATTEMPTS) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());

    // Configure NTP time for accurate ISO timestamps
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  } else {
    Serial.println("\n[WiFi] Connection failed. Will retry during main loop without blocking sensors.");
  }
}

String getCurrentIsoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    // If NTP not yet synced, fallback to millis-based approximate ISO placeholder
    char buf[32];
    snprintf(buf, sizeof(buf), "1970-01-01T00:00:%02lu.%03luZ", (millis() / 1000) % 60, millis() % 1000);
    return String(buf);
  }
  char timeStringBuff[32];
  strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(timeStringBuff);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println(" SMART PANTRY MONITORING SYSTEM - ESP32 FIRMWARE ");
  Serial.printf(" Device: %s | Container: %s | Version: %s\n", DEVICE_ID, CONTAINER_ID, FIRMWARE_VERSION);
  Serial.println("==================================================");

  // 1. Initialize DHT22
  Serial.println("[Sensors] Initializing DHT22 on GPIO 15...");
  dht.begin();
  delay(1000);
  float initialT = dht.readTemperature();
  float initialH = dht.readHumidity();
  if (!isnan(initialT) && !isnan(initialH)) {
    isDHTReady = true;
    cachedTemperature = initialT;
    cachedHumidity = initialH;
    Serial.printf("[Sensors] DHT22 ready. Temp: %.1f C, Humidity: %.1f %%\n", initialT, initialH);
  } else {
    Serial.println("[Sensors] ⚠️ DHT22 initial read warning (sensor may need a moment to stabilize).");
  }

  // 2. Initialize HX711 Load Cell
  Serial.printf("[Sensors] Initializing HX711 on DT: GPIO %d, SCK: GPIO %d...\n", HX711_DT_PIN, HX711_SCK_PIN);
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);

  if (scale.wait_ready_timeout(2000)) {
    isHX711Ready = true;
    scale.set_scale(LOADCELL_CALIBRATION_FACTOR);
    Serial.println("[Sensors] HX711 detected. Taring platform (zeroing)...");
    scale.tare(10); // Average 10 readings for stable zero
    Serial.printf("[Sensors] Tare complete. Calibration factor set to: %.2f\n", LOADCELL_CALIBRATION_FACTOR);
  } else {
    Serial.println("[Sensors] ❌ HX711 load cell amplifier not detected. Please verify wiring.");
  }

  // 3. Connect Wi-Fi
  setupWiFi();

  Serial.printf("\n[System] Initialization complete. Telemetry will sample every %d ms.\n\n", SAMPLING_INTERVAL_MS);
}

void loop() {
  unsigned long now = millis();

  // Re-verify Wi-Fi connection if lost (non-blocking attempt)
  if (WiFi.status() != WL_CONNECTED && (now - lastSampleTime >= WIFI_RETRY_INTERVAL_MS)) {
    Serial.println("[WiFi] Reconnecting to Wi-Fi...");
    WiFi.reconnect();
  }

  // Check if it is time for the next sample
  if (now - lastSampleTime >= SAMPLING_INTERVAL_MS || lastSampleTime == 0) {
    lastSampleTime = now;
    sequenceCounter++;

    // 1. Read Load Cell with Moving Average Filter
    float rawMeasuredGrams = 0.0f;
    float foodWeightGrams = 0.0f;
    String weightStatus = "ok";

    if (scale.is_ready()) {
      isHX711Ready = true;
      // Read average of N samples for noise suppression
      rawMeasuredGrams = scale.get_units(WEIGHT_AVERAGE_SAMPLES);
      // Account for empty container tare offset
      foodWeightGrams = rawMeasuredGrams - CONTAINER_TARE_GRAMS;
      // Clamp noise below 0
      if (foodWeightGrams < 0.0f) {
        foodWeightGrams = 0.0f;
      }
    } else {
      isHX711Ready = false;
      weightStatus = "error";
      Serial.println("[Sensors] ⚠️ HX711 load cell unavailable during sample.");
    }

    // 2. Read DHT22 with rate limiting (at least 2.5s between reads)
    if (now - lastDHTReadTime >= DHT_MIN_INTERVAL_MS) {
      lastDHTReadTime = now;
      float t = dht.readTemperature();
      float h = dht.readHumidity();

      if (!isnan(t) && !isnan(h) && t >= -40.0f && t <= 80.0f && h >= 0.0f && h <= 100.0f) {
        isDHTReady = true;
        cachedTemperature = t;
        cachedHumidity = h;
      } else {
        isDHTReady = false;
        Serial.println("[Sensors] ⚠️ DHT22 read error (using cached or fallback values).");
      }
    }

    // Overall sensor status
    String overallStatus = (isHX711Ready && isDHTReady) ? "ok" : "degraded";

    // 3. Serial Monitor Diagnostics
    Serial.println("--------------------------------------------------");
    Serial.printf("[Telemetry #%lu] %s\n", sequenceCounter, getCurrentIsoTimestamp().c_str());
    Serial.printf("  Load Cell Gross: %.1f g | Net Food: %.1f g\n", rawMeasuredGrams, foodWeightGrams);
    Serial.printf("  Temperature:     %.1f C\n", cachedTemperature);
    Serial.printf("  Humidity:        %.1f %%\n", cachedHumidity);
    Serial.printf("  Status:          %s\n", overallStatus.c_str());

    // 4. Construct JSON Payload
    StaticJsonDocument<384> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["containerId"] = CONTAINER_ID;
    doc["timestamp"] = getCurrentIsoTimestamp();
    doc["weightGrams"] = round(foodWeightGrams * 10.0f) / 10.0f;
    doc["temperatureC"] = round(cachedTemperature * 10.0f) / 10.0f;
    doc["humidityPercent"] = round(cachedHumidity * 10.0f) / 10.0f;
    doc["rawWeightGrams"] = round(rawMeasuredGrams * 10.0f) / 10.0f;
    doc["sensorStatus"] = overallStatus;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["sequenceNumber"] = sequenceCounter;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // 5. Transmit Payload to Trusted Ingestion Endpoint
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(INGESTION_ENDPOINT);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-device-token", DEVICE_AUTH_TOKEN);
      http.setTimeout(5000); // 5s timeout

      Serial.printf("[HTTP] Uploading payload to %s...\n", INGESTION_ENDPOINT);
      int httpCode = http.POST(jsonPayload);

      if (httpCode > 0) {
        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
          String response = http.getString();
          Serial.printf("[HTTP]  Upload successful (HTTP %d)\n", httpCode);
        } else {
          Serial.printf("[HTTP] ⚠️ Server returned HTTP error: %d\n", httpCode);
          Serial.println(http.getString());
        }
      } else {
        Serial.printf("[HTTP] ❌ POST failed, error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    } else {
      Serial.println("[HTTP] ⚠️ Wi-Fi disconnected. Transmission skipped (local readings continue).");
    }
    Serial.println("--------------------------------------------------\n");
  }

  // Small yield to prevent watchdog resets
  delay(50);
}
