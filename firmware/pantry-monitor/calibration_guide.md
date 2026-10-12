# Load Cell (HX711) Calibration & Setup Guide

This guide walks through calibrating your load cell and HX711 amplifier on the ESP32 for the Smart Pantry System (`container-01`).

---

## 1. Hardware Pinout & Wiring

### HX711 Amplifier to ESP32

| HX711 Pin | ESP32 Pin | Purpose |
| :--- | :--- | :--- |
| **VCC** | **3.3V** | Power Supply (3.3V recommended) |
| **GND** | **GND** | Ground |
| **DT (Data)** | **GPIO 4** | Serial Data Output |
| **SCK (Clock)** | **GPIO 5** | Serial Clock Input |

### Load Cell to HX711

> ⚠️ **IMPORTANT WIRE COLOR NOTICE**: Load cell wire color schemes vary significantly across manufacturers (e.g., SparkFun, generic AliExpress, YZC-133, CZL601). **Do NOT assume wire colors are standardized**. Always check your specific load cell datasheet or multi-meter resistance if uncertain.

**Typical 4-Wire Load Cell Reference:**

```text
Red Wire    → E+ (Excitation Positive)
Black Wire  → E- (Excitation Negative / Ground)
White Wire  → A- (Signal Negative)
Green Wire  → A+ (Signal Positive)
```

---

## 2. Step-by-Step Calibration Procedure

### Step 1: Prepare a Known Reference Weight
Find an object with an exact, known weight in grams (e.g., a 500.0g calibration weight, or a full unopened 1000g package measured on a kitchen scale).

### Step 2: Upload Firmware with Default Scale
In `firmware/pantry-monitor/config.h`, ensure `LOADCELL_CALIBRATION_FACTOR` is set to `1.0f` for initial raw reading.

### Step 3: Run Zero / Tare
1. Ensure the platform is empty (nothing on the load cell).
2. Power on the ESP32 and open the **Arduino Serial Monitor** (115200 baud).
3. The firmware will execute `scale.tare()`, establishing the baseline 0g level.

### Step 4: Measure Reference Weight
1. Place your known reference weight (e.g., $W_{known} = 500\text{ g}$) gently on the center of the platform.
2. Observe the raw number printed in the Serial Monitor (e.g., $R_{raw} = 210000$).

### Step 5: Calculate Calibration Factor
Calculate your scale factor using the formula:

$$\text{Calibration Factor} = \frac{\text{Raw Reading}}{\text{Known Weight in Grams}}$$

*Example:*
$$\text{Calibration Factor} = \frac{210000}{500\text{ g}} = 420.0$$

### Step 6: Update `config.h`
Open `firmware/pantry-monitor/config.h` and update:

```cpp
#define LOADCELL_CALIBRATION_FACTOR 420.0f
```

Recompile and upload the sketch to the ESP32.

### Step 7: Verify Accuracy
Place multiple known weights (e.g., 100g, 500g, 1000g). The Serial Monitor and dashboard should now accurately report the weight in grams within ±1–2g tolerance.

---

## 3. Container Tare & Noise Filtering

- **Empty Container Tare**: If you place a storage container on the load cell, you can configure its weight in `config.h` (`CONTAINER_TARE_GRAMS`) or interactively on the **Live Monitoring** dashboard page.
- **Moving Average Filter**: The firmware takes `WEIGHT_AVERAGE_SAMPLES` (10 samples) on each measurement cycle to suppress vibrations and electrical ADC noise.
