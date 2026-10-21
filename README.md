# Smart Pantry Monitoring System — Phase 8 (Low-Stock/Restock Alerts & Shopping List)

A real-time smart pantry inventory, environmental monitoring, consumption tracking, machine-learning depletion prediction, low-stock alert, and shopping list platform combining **ESP32 microcontroller hardware**, **HX711 load cell weight sensing**, **DHT22 climate tracking**, a **trusted Node.js/Express ingestion pipeline**, a **Python FastAPI + scikit-learn ML microservice**, and a **React + TypeScript dashboard backed by Cloud Firestore**.

---

## 1. System Architecture

```text
+-----------------------+     +-----------------------+
|  Load Cell (5kg/10kg) |     |  DHT22 Temp / Hum     |
+-----------+-----------+     +-----------+-----------+
            |                             |
     (Analog Signal)               (Digital Signal)
            |                             |
+-----------v-----------+                 |
| HX711 24-Bit ADC Amp  |                 |
+-----------+-----------+                 |
            | (GPIO 4 DT, GPIO 5 SCK)     | (GPIO 15 DATA)
+-----------v-----------------------------v-----------+
|              ESP32 Microcontroller Unit             |
|  - Zero / Tare Calibration                          |
|  - Moving Average Noise Smoothing                   |
|  - DHT22 2.5s Minimum Sampling Interval             |
|  - JSON Payload Formatting                          |
+--------------------------+--------------------------+
                           |
                     (Wi-Fi HTTPS)
                           |
+--------------------------v--------------------------+
|          Trusted Server Ingestion Service           |
|  - Endpoint: POST /api/sensors/reading              |
|  - Device Token Authentication (x-device-token)     |
|  - Strict Numeric Range & Clock Drift Validation   |
+--------------------------+--------------------------+
                           |
             (Admin SDK / Firestore API)
                           |
+--------------------------v--------------------------+
|                 Cloud Firestore                     |
|  - users/{uid}/currentSensorState/{containerId}     |
|  - users/{uid}/sensorReadings/{readingId}           |
|  - users/{uid}/quantityEvents/{eventId}             |
+--------------------------+--------------------------+
                           |
                  (Real-Time onSnapshot)
                           |
+--------------------------v--------------------------+
|             React + TypeScript Dashboard            |
|  - Live Monitoring Page (#live-monitoring)          |
|  - Quantity History & Trend Chart ([24H][7D][30D])  |
|  - Consumption & Refill Event Detection             |
|  - Refill-Aware Consumption Statistics              |
|  - ML Predictions Dashboard (#ml-predictions)       |
+--------------------------+--------------------------+
                           |
             (HTTP POST /predict/depletion)
                           |
+--------------------------v--------------------------+
|            Python FastAPI ML Microservice           |
|  - Linear Regression Slope Engine (scikit-learn)    |
|  - Refill-Aware Cumulative Depletion Segmentation   |
|  - Statistical Metrics (R², MAE, Confidence)        |
|  - Zero-Depletion Projection Trajectory Generation  |
|  - Resilient In-Browser Fallback Engine             |
+-----------------------------------------------------+
```

---

## 2. Phase 6: Quantity History & Consumption Tracking

Phase 6 turns raw load-cell weight history into actionable consumption metrics for `container-01`:

1. **Noise Suppression Threshold (`SIGNIFICANT_CHANGE_GRAMS = 50g`)**:
   Load cells naturally fluctuate (±1g to ±5g). Weight differences below 50g are filtered out as sensor noise and do not generate false events.
2. **Consumption Detection**:
   When quantity drops by $\ge 50\text{g}$, a `consumption` event is logged (e.g., $2500\text{g} \rightarrow 2300\text{g} \implies -200\text{g}$).
3. **Refill Detection**:
   When quantity increases by $\ge 50\text{g}$, a `refill` event is logged (e.g., $1000\text{g} \rightarrow 3000\text{g} \implies +2000\text{g}$).
4. **Refill-Aware Consumption Math**:
   Refills reset the consumption baseline. For a sequence $3000\text{g} \rightarrow 2500\text{g} \rightarrow 5000\text{g} \rightarrow 4500\text{g}$, total consumption is calculated as $(3000-2500) + (5000-4500) = 1000\text{g}$, rather than $3000 - 4500$.
5. **Idempotency & Duplicate Prevention**:
   Event IDs are deterministic based on reading transitions (`qevent_{fromReadingId}_{toReadingId}`). Processing the same stream multiple times produces identical event IDs.
6. **Chronological Sorting**:
   Sensor readings are strictly sorted by `timestamp` before computing transitions to safely handle out-of-order document delivery.
7. **Consumption Statistics**:
   - **Today's Consumption**: Grams consumed since midnight local time.
   - **Last 7 Days**: Total grams consumed in the trailing 7 days.
   - **Daily Average**: Computed only when reading history spans $\ge 24\text{ hours}$; displays `Not enough data yet` otherwise.

---

## 3. Phase 7: ML Depletion Prediction

Phase 7 uses historical quantity and consumption telemetry to forecast when pantry items in `container-01` will run out:

1. **Refill-Aware Linear Regression**:
   - Standard linear regression across a whole time series fails when containers are refilled, treating refills as "negative consumption".
   - Our depletion engine partitions the timeline at every refill ($\Delta W \ge 50\text{g}$).
   - It tracks strictly cumulative consumption across depletion segments and regresses consumed weight $y$ against elapsed time $x$:
     $$\text{Rate (g/day)} = \text{LinearRegression}(\Delta t_{\text{days}}, \Delta W_{\text{consumed}})$$
2. **Depletion Date & Trajectory Forecast**:
   - $$\text{Days Remaining} = \frac{\text{Current Weight}}{\text{Daily Consumption Rate}}$$
   - Generates daily projection points from current timestamp until projected zero-point.
3. **Strict Minimum Data Requirements (No Fabricated Guesses)**:
   - Requires at least **3 valid consumption points** spanning at least **24 hours**.
   - If insufficient data exists, the system returns `insufficient_data` confidence without displaying fabricated predictions.
4. **Confidence Rating Calculation**:
   - Evaluates coefficient of determination ($R^2$), Mean Absolute Error (MAE), sample count, and time span.
   - Ratings: `high` ($R^2 \ge 0.85$, $MAE \le 40\text{g}$), `medium` ($R^2 \ge 0.65$), `low`, or `insufficient_data`.
5. **Dual Architecture (Microservice + Client Fallback)**:
   - **Primary**: Python FastAPI microservice (`ml-service/app/main.py`) powered by `scikit-learn` on port 8000.
   - **Fallback**: TypeScript client engine (`src/utils/mlPredictor.ts`) running identical regression math if the Python service is offline.
6. **Frontend Dashboard (`#ml-predictions`)**:
   - Current item & load-cell status banner.
   - 4 KPI summary cards: Days Remaining, Estimated Empty Date, Daily Burn Rate, and Model Confidence.
   - Interactive Recharts trajectory chart displaying actual historical weights alongside the dotted ML depletion trendline.
   - Model Diagnostics card displaying $R^2$, MAE, data points analyzed, time span, and data quality notes.

---

## 4. Phase 8: Low-Stock Alerts and Shopping List Management

Overview

Phase 8 enhances the Smart Pantry Monitoring System by introducing low-stock monitoring, automated restocking alerts, and shopping list management. These features help users track pantry inventory, identify items that need replenishment, and manage shopping more efficiently.

**Features**

1. **Low-Stock Threshold Monitoring**

Allows users to configure a minimum stock threshold for inventory items.

Identifies items whose quantity falls below the configured threshold.

Helps users monitor pantry supplies and avoid running out of essential items.

2. **Automated Low-Stock Alerts**

Generates alerts when an item's stock falls below its minimum threshold.

Prevents duplicate low-stock alerts for the same item.

Resolves low-stock alerts when the item is restocked.

3. **Shopping List Management**

Supports adding items to the shopping list.

Allows users to add items manually or through restocking workflows.

Enables users to mark items as purchased.

Allows users to remove items from the shopping list.

4. **Dashboard Integration**

Integrates low-stock information into the dashboard summary.

Provides navigation to shopping list management.

Helps users identify items that require attention.

**Technologies and Implementation**

Phase 8 builds on the existing Smart Pantry Monitoring System using:

React and TypeScript for the user interface and application logic.

Firebase Firestore for application data and security rules.

Vitest for frontend utility and component-related tests.

Pytest for Python-side tests.

ESLint for code quality checks.

Testing and Validation

The Phase 8 implementation was validated with the following reported results:

Vitest: 88 tests passed across 9 test files.

Pytest: 7 tests passed.

ESLint: No errors or warnings.

Production build: Successful.

**Expected Outcome**

Phase 8 improves pantry inventory management by notifying users when stock is low and providing a convenient shopping list for replenishment. It reduces the need for manual stock checking and supports a more organized pantry management workflow.

## 5. Hardware Bill of Materials (BOM)

| Component | Specification | Quantity | Scope / Purpose |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32 DevKit v1 / NodeMCU-32S | 1 | Sensor sampling, local filtering, Wi-Fi uplink |
| **Load Cell** | Straight Bar Strain Gauge (5kg or 10kg) | 1 | Container weight sensing for `container-01` |
| **Amplifier** | HX711 24-Bit ADC Module | 1 | Precision load cell signal amplification |
| **Climate Sensor** | DHT22 (AM2302) | 1 | Ambient temperature & relative humidity |
| **Resistor** | 4.7kΩ – 10kΩ Pull-up (if bare DHT22) | 1 | DHT22 data line pull-up to 3.3V |
| **Breadboard / Wires** | Jumper Wires (F-F, M-F) | 1 set | Hardware prototyping interconnects |

---

## 6. Hardware Pinout & Wiring

### ESP32 Pin Assignments

```text
HX711 Module:
  HX711 VCC  →  ESP32 3.3V
  HX711 GND  →  ESP32 GND
  HX711 DT   →  ESP32 GPIO 4
  HX711 SCK  →  ESP32 GPIO 5

DHT22 Sensor:
  DHT22 VCC   →  ESP32 3.3V
  DHT22 DATA  →  ESP32 GPIO 15 (with pull-up to 3.3V)
  DHT22 GND   →  ESP32 GND
```

### Load Cell to HX711 Wiring Reference

> ⚠️ **IMPORTANT WIRE COLOR NOTICE**: Load cell wire color schemes vary by manufacturer. Always check your load cell datasheet before powering on.

```text
Red Wire    → E+ (Excitation +)
Black Wire  → E- (Excitation -)
White Wire  → A- (Signal -)
Green Wire  → A+ (Signal +)
```

---

## 7. Arduino IDE Setup & Required Libraries

### Required Arduino Libraries
1. **`HX711`** by *bogde* (v0.7.5+)
2. **`DHT sensor library`** by *Adafruit* (v1.4.4+)
3. **`Adafruit Unified Sensor`** by *Adafruit*
4. **`ArduinoJson`** by *Benoit Blanchon* (v6.21.0+)

---

## 8. Firestore Schema

### Current Sensor State
`users/{uid}/currentSensorState/container-01`
```json
{
  "containerId": "container-01",
  "deviceId": "device-01",
  "currentWeight": 2450.0,
  "weightUnit": "g",
  "temperature": 22.4,
  "humidity": 58.0,
  "lastUpdated": "2026-10-07T01:30:00.000Z",
  "sensorStatus": "ok"
}
```

### Historical Sensor Readings
`users/{uid}/sensorReadings/{readingId}`
```json
{
  "id": "reading_1760000000_a1b2c3d4",
  "deviceId": "device-01",
  "containerId": "container-01",
  "trackingMethod": "load-cell",
  "measuredWeight": 2450.0,
  "weightUnit": "g",
  "temperature": 22.4,
  "humidity": 58.0,
  "timestamp": "2026-10-07T01:30:00.000Z",
  "sensorStatus": "ok"
}
```

### Derived Quantity Events (Phase 6)
`users/{uid}/quantityEvents/{eventId}`
```json
{
  "id": "qevent_readingA_readingB",
  "containerId": "container-01",
  "type": "consumption",
  "amountGrams": 200.0,
  "previousWeightGrams": 2500.0,
  "newWeightGrams": 2300.0,
  "timestamp": "2026-10-07T01:40:00.000Z",
  "fromReadingId": "readingA",
  "toReadingId": "readingB"
}
```

---

## 9. Development Sensor & Action Simulators

Test the ingestion pipeline, consumption detection, inventory actions, and climate alert thresholds without physical hardware:

### A. Item Take & Refill Actions (`simulateTakeAndRefill.ts`)
Preserves live container weight and automatically computes delta ($\Delta W$) to trigger consumption ($\ge 50$g) or refill ($\ge 50$g) events:

```bash
# Take food/items (e.g. consume 200g of rice)
node scripts/simulateTakeAndRefill.ts --take 200 --item "Rice"
# or: npm run simulate:action -- --take 200

# Refill items (e.g. replenish +1500g)
node scripts/simulateTakeAndRefill.ts --refill 1500 --item "Basmati Rice"
# or: npm run simulate:action -- --refill 1500

# Run automated multi-action breakfast/lunch/dinner scenario cycle
node scripts/simulateTakeAndRefill.ts --scenario

# Seed 5-day realistic consumption history for ML prediction & linear regression
node scripts/simulateTakeAndRefill.ts --seed-history

# Interactive take & refill prompt menu
node scripts/simulateTakeAndRefill.ts --interactive
```

### B. Environmental Climate Simulation (`simulateClimate.ts`)
Simulates DHT22 ambient temperature and humidity variations, triggering UI threshold alerts without altering container inventory weight:

```bash
# Heatwave / High temperature warning sequence (> 25°C)
node scripts/simulateClimate.ts --preset heatwave

# Cold storage warning sequence (< 15°C)
node scripts/simulateClimate.ts --preset cold

# High humidity / mold risk alert sequence (> 65%)
node scripts/simulateClimate.ts --preset humid

# Arid / low humidity warning (< 35%)
node scripts/simulateClimate.ts --preset dry

# 24-Hour Diurnal day/night temperature and humidity cycle
node scripts/simulateClimate.ts --preset diurnal

# Set explicit static climate values
node scripts/simulateClimate.ts --temp 28.5 --humidity 72.0

# Interactive climate menu
node scripts/simulateClimate.ts --interactive
```

### C. Basic Sensor Telemetry Streaming (`simulateSensor.ts`)

```bash
# Run automated scenario pattern
npm run simulate:sensor -- --pattern

# Continuous telemetry streaming every 15s
npm run simulate:sensor
```

---

## 10. Python ML Microservice Setup & Tests

The ML service operates independently in `ml-service/`:

```bash
# 1. Install Python dependencies
pip install -r ml-service/requirements.txt

# 2. Run pytest suite (7 depletion & segmentation tests)
npm run ml:test
# or directly:
python -m pytest ml-service/tests

# 3. Start FastAPI prediction service on port 8000
npm run ml:server
# or directly:
python -m uvicorn app.main:app --app-dir ml-service --port 8000 --reload
```

Interactive API documentation is available at `http://localhost:8000/docs`.

---

## 11. Running the Full Application & Tests

```bash
# 1. Run all unit and integration tests (Vitest)
npm test

# 2. Run TypeScript type check and production build
npm run build

# 3. Run ESLint code quality check
npm run lint

# 4. Start frontend development server (Vite)
npm run dev
```

---

## 12. Phase 8: Low-Stock Alerts, Restock Triggers & Shopping List

Phase 8 introduces proactive inventory replenishment and grocery management:

1. **Configurable Minimum Stock Thresholds**:
   - Each pantry item supports a configurable minimum stock threshold (`minStockThreshold`) in the item's preferred unit (`kg` or `g`).
   - Sensible backward-compatible defaults: `0.5 kg` (500 g) if unspecified.
   - Validated on the client, in repositories, and strictly enforced in `firestore.rules` (`minStockThreshold >= 0`).

2. **Automatic Low-Stock Identification**:
   - Evaluates current container stock against the item's threshold.
   - Uses authoritative real-time sensor weight from the HX711 load cell when online, with fallback to initial manual baseline.
   - Differentiates between normal stock, low stock ($W \le \text{Threshold}$), and empty / out-of-stock ($W = 0\text{g}$).

3. **Deduplicated Alert Generation & Auto-Resolution**:
   - Generates deterministic, item-keyed alert IDs (`low_stock_${itemId}`).
   - Avoids duplicate notifications while condition persists.
   - Automatically marks alerts as `resolved` when the container is refilled above threshold, updating the alert message with the replenished weight.
   - Reactivates resolved alerts if the container is subsequently depleted below threshold again.

4. **Interactive Restock Shopping List (`#shopping-list`)**:
   - **Automatic Addition**: Low-stock pantry items are automatically synced to the shopping list with deficit-based target reorder quantities.
   - **Manual Items**: Add custom grocery and household items with categories, target quantities, and notes.
   - **Purchase Tracking**: Toggle items as purchased (with line-through styling and completion timestamps).
   - **Item Management**: Individual deletion and bulk "Clear Purchased" operations.
   - **Filter Views**: `To Buy`, `All Items`, and `Purchased`.
   - **ML Depletion Integration**: Auto-added items display real-time ML forecast badges with estimated remaining days and burn rate.

5. **Dashboard & Sidebar Integration**:
   - Summary cards highlight low-stock items in amber and show active shopping list items to buy.
   - Live stock weight metric card displays low-stock warning and configured threshold.
   - Recent activity list shows low-stock and resolved alert states.
   - Sidebar navigation badges display real-time counts for unread alerts and items to buy.

---

## 13. Phase Scope & Completed Milestones

- **Phase 7 Scope Completed**: Refill-aware ML depletion linear regression, rate calculation, days remaining forecasting, confidence scoring, Recharts trajectory visualization, model diagnostics, and Python FastAPI microservice.
- **Phase 8 Scope Completed**: Configurable item stock thresholds, automatic low-stock detection, deduplicated alerts, automatic resolution on restock, interactive shopping list with manual & auto item addition, purchased tracking, dashboard indicators, and Firestore persistence with security rules.
- **Phase 9, Task 1 Scope Completed**: Backend Firebase Admin SDK persistence for sensor telemetry with atomic batch writes to `currentSensorState` and `sensorReadings`, strict constant-time device authentication token comparison (`timingSafeEqual`), and graceful in-memory fallback.
- **Phase 9, Task 2 Scope Completed**: Multiple pantry inventory items decoupled from physical sensor containers, distinct item and container IDs, exclusive single-item hardware container locking (`container-01`), dynamic multi-item UI rendering, and isolated telemetry mapping.

---

## 14. Phase 9, Task 2: Multiple Pantry Items & Container Assignment

Phase 9, Task 2 expands the pantry inventory system to support multiple food items while maintaining strict hardware container association:

1. **Decoupled Inventory Items**:
   - Pantry items can exist independently of physical IoT containers (`containerId: null` or unassigned).
   - Unassigned items are tracked manually with initial/baseline quantities, category, unit, expiration date, and minimum stock thresholds.

2. **Distinct Item and Container Identifiers**:
   - Pantry item IDs are distinct UUIDs (e.g. `9f1d4b68-...`), avoiding conflation with physical container hardware IDs (e.g. `container-01`).

3. **Exclusive Container Assignment**:
   - `container-01` enforces exclusive assignment: two active items cannot hold assignment to `container-01` simultaneously.
   - Adding or updating an item with `containerId: 'container-01'` verifies that no other item currently claims `container-01` (checked in both local storage and Cloud Firestore transaction locks).
   - Unassigning or deleting an item frees `container-01` for assignment by other pantry items.

4. **Sensor Telemetry Isolation**:
   - Sensor weight telemetry from the HX711 load cell (`container-01`) is mapped exclusively to `container-01` and its actively assigned item.
   - Unassigned items or items on other containers evaluate stock status against their manual baseline quantities, avoiding false low-stock alerts or incorrect sensor weight mapping.

5. **Firestore Security Rules**:
   - `users/{userId}/items/{itemId}` allows `containerId` to be `null` or a string, and `trackingMethod` to be `load-cell` or `manual`.
   - Single-container metadata lock on `users/{userId}/containers/{containerId}` guarantees concurrency protection and user data isolation (`ownsUserData`).

