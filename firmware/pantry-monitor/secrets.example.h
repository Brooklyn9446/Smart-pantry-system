#ifndef SECRETS_H
#define SECRETS_H

// Copy this file to secrets.h and populate with your network credentials
// DO NOT commit secrets.h to version control!

// Wi-Fi Configuration
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Ingestion API Endpoint
// For local network testing with PC running server: e.g. "http://192.168.1.100:3001/api/sensors/reading"
// For cloud/production deployment: e.g. "https://api.yourpantrydomain.com/api/sensors/reading"
#define INGESTION_ENDPOINT "http://192.168.1.100:3001/api/sensors/reading"

// Device Authentication Token (Matches DEVICE_AUTH_TOKEN in server/.env)
#define DEVICE_AUTH_TOKEN "pantry-device-token-secret-2026"

#endif // SECRETS_H
