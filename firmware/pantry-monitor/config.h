#ifndef CONFIG_H
#define CONFIG_H

// Device & Container Identity
#define DEVICE_ID "device-01"
#define CONTAINER_ID "container-01"
#define FIRMWARE_VERSION "v1.0.0"

// Hardware Pinout Configuration (ESP32)
// HX711 Load Cell Amplifier
#define HX711_DT_PIN 4      // HX711 Data pin -> ESP32 GPIO 4
#define HX711_SCK_PIN 5     // HX711 Clock pin -> ESP32 GPIO 5

// DHT22 Temperature & Humidity Sensor
#define DHT_PIN 15          // DHT22 Data pin -> ESP32 GPIO 15
#define DHT_TYPE DHT22      // DHT22 (AM2302 / RHT03)

// Sensor Sampling & Operation
#define SAMPLING_INTERVAL_MS 15000  // Transmit telemetry every 15 seconds (15000 ms)
#define DHT_MIN_INTERVAL_MS 2500    // Respect DHT22 minimum 2-second read interval
#define WEIGHT_AVERAGE_SAMPLES 10   // Number of HX711 samples for moving average noise reduction

// Calibration Settings
// Calibration factor calculated via calibration procedure: (raw_adc_units / known_weight_grams)
// Set this to your calibrated value. Default placeholder: 420.0f
#define LOADCELL_CALIBRATION_FACTOR 420.0f

// Optional empty container tare offset in grams (subtracted on device if enabled)
#define CONTAINER_TARE_GRAMS 0.0f

// Network Reconnection Settings
#define WIFI_RETRY_INTERVAL_MS 5000
#define WIFI_MAX_RETRY_ATTEMPTS 10

#endif // CONFIG_H
