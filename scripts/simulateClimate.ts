import dotenv from 'dotenv'
import readline from 'node:readline'

dotenv.config({ path: '.env.local' })
dotenv.config()

const BASE_SERVER_URL = process.env.INGESTION_SERVER_URL || 'http://localhost:3001'
const INGESTION_ENDPOINT = `${BASE_SERVER_URL}/api/sensors/reading`
const CURRENT_STATE_ENDPOINT = `${BASE_SERVER_URL}/api/sensors/current`
const DEVICE_TOKEN = process.env.DEVICE_AUTH_TOKEN || 'pantry-device-token-secret-2026'

const DEFAULT_DEVICE_ID = 'device-01'
const DEFAULT_CONTAINER_ID = 'container-01'
const DEFAULT_WEIGHT = 2450

// Thresholds according to Smart Pantry Live Monitoring UI
const TEMP_HIGH_THRESHOLD = 25 // °C
const TEMP_LOW_THRESHOLD = 15 // °C
const HUMIDITY_HIGH_THRESHOLD = 65 // %
const HUMIDITY_LOW_THRESHOLD = 35 // %

export type ClimatePreset =
  | 'normal'
  | 'hot'
  | 'heatwave'
  | 'cold'
  | 'humid'
  | 'high-humidity'
  | 'dry'
  | 'spoilage'
  | 'diurnal'
  | 'fluctuate'
  | 'ramp'

interface ClimateOptions {
  preset?: ClimatePreset
  temp?: number
  humidity?: number
  containerId: string
  deviceId: string
  weight?: number
  intervalSeconds: number
  steps?: number
  stream: boolean
  once: boolean
  interactive: boolean
  rampStartTemp?: number
  rampEndTemp?: number
}

let sequenceNumber = 1

interface CurrentStateResponse {
  success: boolean
  state?: {
    containerId: string
    deviceId: string
    currentWeight: number
    weightUnit: string
    temperature: number
    humidity: number
    lastUpdated: string
    sensorStatus: string
  }
}

/**
 * Fetch current state of container so climate simulation does not overwrite inventory weight.
 */
async function fetchCurrentWeight(containerId: string): Promise<number> {
  try {
    const res = await fetch(`${CURRENT_STATE_ENDPOINT}/${containerId}`)
    if (res.ok) {
      const data = (await res.json()) as CurrentStateResponse
      if (data.state && typeof data.state.currentWeight === 'number') {
        return data.state.currentWeight
      }
    }
  } catch {
    // server unreachable or container not found
  }
  return DEFAULT_WEIGHT
}

/**
 * Send sensor reading to ingestion server.
 */
async function sendClimateReading(params: {
  deviceId: string
  containerId: string
  weightGrams: number
  temperatureC: number
  humidityPercent: number
  label?: string
  customTimestamp?: string
}): Promise<{ ok: boolean; readingId?: string }> {
  const roundedWeight = Math.round(params.weightGrams * 10) / 10
  const roundedTemp = Math.round(params.temperatureC * 10) / 10
  const roundedHumidity = Math.round(params.humidityPercent * 10) / 10

  const payload = {
    deviceId: params.deviceId,
    containerId: params.containerId,
    timestamp: params.customTimestamp || new Date().toISOString(),
    weightGrams: roundedWeight,
    temperatureC: roundedTemp,
    humidityPercent: roundedHumidity,
    sensorStatus: 'simulated' as const,
    rawWeightGrams: Math.round((roundedWeight + 350) * 10) / 10,
    firmwareVersion: 'v1.1.0-climate-sim',
    sequenceNumber: sequenceNumber++,
  }

  // Determine climate status tags
  const tempStatus =
    roundedTemp > TEMP_HIGH_THRESHOLD
      ? '🔥 HIGH TEMP (>25°C Alert)'
      : roundedTemp < TEMP_LOW_THRESHOLD
      ? '❄️ LOW TEMP (<15°C Alert)'
      : '✅ Optimal Temp'

  const humidityStatus =
    roundedHumidity > HUMIDITY_HIGH_THRESHOLD
      ? '💧 HIGH HUMIDITY (>65% Mold Risk)'
      : roundedHumidity < HUMIDITY_LOW_THRESHOLD
      ? '🏜️ LOW HUMIDITY (<35% Dry Air)'
      : '✅ Optimal Humidity'

  console.log(`\n[DHT22 Climate Sensor] 📡 Reading #${payload.sequenceNumber} -> ${params.containerId}`)
  console.log(`                       🌡️ Temp:     ${roundedTemp}°C  [${tempStatus}]`)
  console.log(`                       💧 Humidity: ${roundedHumidity}% [${humidityStatus}]`)
  console.log(`                       ⚖️ Weight:   ${roundedWeight}g`)

  try {
    const res = await fetch(INGESTION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': DEVICE_TOKEN,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`  ❌ HTTP ${res.status}: ${err}`)
      return { ok: false }
    }

    const data = (await res.json()) as { readingId?: string }
    console.log(`  ✅ Ingested OK (Reading ID: ${data.readingId})`)
    return { ok: true, readingId: data.readingId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Ingestion request failed: ${msg}`)
    return { ok: false }
  }
}

/**
 * Run a predefined climate preset.
 */
async function runPreset(preset: ClimatePreset, options: ClimateOptions) {
  const baseWeight = options.weight ?? (await fetchCurrentWeight(options.containerId))

  console.log(`\n======================================================================`)
  console.log(` 🌡️ SIMULATING CLIMATE PRESET: [${preset.toUpperCase()}]`)
  console.log(` Container: ${options.containerId} | Current Base Weight: ${baseWeight}g`)
  console.log(`======================================================================`)

  switch (preset) {
    case 'normal': {
      console.log('Description: Standard comfortable pantry storage conditions.')
      await sendClimateReading({
        deviceId: options.deviceId,
        containerId: options.containerId,
        weightGrams: baseWeight,
        temperatureC: 22.4,
        humidityPercent: 52.0,
      })
      break
    }

    case 'hot':
    case 'heatwave': {
      console.log('Description: Warm summer pantry / heatwave conditions (> 25°C warning trigger).')
      const temps = [25.5, 27.2, 29.0, 31.5, 30.2]
      const humids = [48.0, 46.5, 45.0, 43.5, 44.0]
      for (let i = 0; i < temps.length; i++) {
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: temps[i],
          humidityPercent: humids[i],
        })
        if (i < temps.length - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }

    case 'cold': {
      console.log('Description: Cold pantry / unheated storage (< 15°C cold warning trigger).')
      const temps = [14.5, 13.0, 11.8, 10.5]
      const humids = [60.0, 62.0, 64.0, 63.5]
      for (let i = 0; i < temps.length; i++) {
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: temps[i],
          humidityPercent: humids[i],
        })
        if (i < temps.length - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }

    case 'humid':
    case 'high-humidity': {
      console.log('Description: High ambient humidity / damp pantry (> 65% mold risk alert).')
      const humids = [66.5, 71.0, 76.5, 82.0, 78.5]
      for (let i = 0; i < humids.length; i++) {
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: 23.5,
          humidityPercent: humids[i],
        })
        if (i < humids.length - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }

    case 'dry': {
      console.log('Description: Arid dry climate / heating season (< 35% dry air trigger).')
      const humids = [34.0, 31.0, 27.5, 23.0]
      for (let i = 0; i < humids.length; i++) {
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: 24.0,
          humidityPercent: humids[i],
        })
        if (i < humids.length - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }

    case 'spoilage': {
      console.log('Description: Critical food spoilage alert condition (High heat + High moisture).')
      await sendClimateReading({
        deviceId: options.deviceId,
        containerId: options.containerId,
        weightGrams: baseWeight,
        temperatureC: 32.8,
        humidityPercent: 84.5,
      })
      break
    }

    case 'diurnal': {
      console.log('Description: Accelerated 24-hour day/night diurnal climate curve.')
      const curve = [
        { label: '06:00 AM (Dawn Low)', temp: 18.2, humidity: 64.0 },
        { label: '09:00 AM (Morning Rise)', temp: 21.0, humidity: 58.0 },
        { label: '12:00 PM (Midday Warmth)', temp: 24.8, humidity: 50.0 },
        { label: '03:00 PM (Afternoon Peak)', temp: 26.5, humidity: 46.0 },
        { label: '06:00 PM (Evening Sunset)', temp: 23.4, humidity: 53.0 },
        { label: '09:00 PM (Night Cooling)', temp: 20.1, humidity: 60.0 },
        { label: '12:00 AM (Midnight)', temp: 18.8, humidity: 63.5 },
      ]

      for (let i = 0; i < curve.length; i++) {
        const pt = curve[i]
        console.log(`\n--- Step ${i + 1}/${curve.length}: ${pt.label} ---`)
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: pt.temp,
          humidityPercent: pt.humidity,
        })
        if (i < curve.length - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }

    case 'fluctuate': {
      console.log(`Description: Continuous realistic sine wave and noise telemetry stream.`)
      await runStream(options, baseWeight)
      break
    }

    case 'ramp': {
      const start = options.rampStartTemp ?? 18
      const end = options.rampEndTemp ?? 30
      const steps = options.steps ?? 6
      console.log(`Description: Ramping temperature from ${start}°C to ${end}°C across ${steps} steps.`)
      for (let i = 0; i < steps; i++) {
        const t = start + ((end - start) * i) / (steps - 1)
        const h = 60 - ((t - 15) * 1.5) // inverse humidity trend
        await sendClimateReading({
          deviceId: options.deviceId,
          containerId: options.containerId,
          weightGrams: baseWeight,
          temperatureC: t,
          humidityPercent: Math.max(20, Math.min(95, h)),
        })
        if (i < steps - 1) {
          await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
        }
      }
      break
    }
  }

  console.log(`\n🎉 Climate simulation complete! View changes on the Live Monitoring & Dashboard charts.`)
}

/**
 * Continuously stream oscillating temperature and humidity data.
 */
async function runStream(options: ClimateOptions, baseWeight: number) {
  let step = 0
  const maxSteps = options.steps ?? Infinity
  const centerTemp = options.temp ?? 23.0
  const centerHumidity = options.humidity ?? 55.0

  console.log(`Streaming climate data every ${options.intervalSeconds}s (Press Ctrl+C to stop)...`)

  while (step < maxSteps) {
    // Generate sine oscillation + minor random noise
    const angle = (step * Math.PI) / 6 // 12-step cycle
    const tempNoise = (Math.random() - 0.5) * 0.4
    const humNoise = (Math.random() - 0.5) * 1.0

    const temp = centerTemp + Math.sin(angle) * 3.5 + tempNoise
    const hum = centerHumidity - Math.sin(angle) * 8.0 + humNoise
    const weightNoise = (Math.random() - 0.5) * 1.5

    await sendClimateReading({
      deviceId: options.deviceId,
      containerId: options.containerId,
      weightGrams: baseWeight + weightNoise,
      temperatureC: temp,
      humidityPercent: Math.max(10, Math.min(95, hum)),
    })

    step++
    if (step < maxSteps) {
      await new Promise((r) => setTimeout(r, options.intervalSeconds * 1000))
    }
  }
}

/**
 * Interactive menu mode.
 */
async function runInteractiveMenu(options: ClimateOptions) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const question = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve))

  while (true) {
    console.log('\n======================================================================')
    console.log(' 🌡️ SMART PANTRY - CLIMATE SIMULATOR (TEMPERATURE & HUMIDITY)')
    console.log(` Container: ${options.containerId}`)
    console.log('======================================================================')
    console.log('  1. 🌿 Optimal conditions (22°C, 52% Humidity)')
    console.log('  2. 🔥 Heatwave / High Temp alert (28°C - 31°C, >25°C trigger)')
    console.log('  3. ❄️ Cold storage / Low Temp alert (10°C - 14°C, <15°C trigger)')
    console.log('  4. 💧 High Humidity / Mold risk (70% - 82%, >65% trigger)')
    console.log('  5. 🏜️ Dry air / Low Humidity (23% - 30%, <35% trigger)')
    console.log('  6. ⚠️ Critical Spoilage risk (32.8°C + 84.5% Humidity)')
    console.log('  7. ☀️ 24-Hour Diurnal Cycle (Full day/night temperature swing)')
    console.log('  8. 🌊 Continuous Fluctuation Stream (Live chart animation)')
    console.log('  9. ✍️ Custom static values (Specify exact °C and %)')
    console.log('  0. 🚪 Exit')
    console.log('----------------------------------------------------------------------')

    const choice = (await question('Select an option (0-9): ')).trim()

    if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log('Exiting climate simulator. Have a great day! 👋')
      rl.close()
      break
    }

    if (choice === '1') {
      await runPreset('normal', options)
    } else if (choice === '2') {
      await runPreset('heatwave', options)
    } else if (choice === '3') {
      await runPreset('cold', options)
    } else if (choice === '4') {
      await runPreset('humid', options)
    } else if (choice === '5') {
      await runPreset('dry', options)
    } else if (choice === '6') {
      await runPreset('spoilage', options)
    } else if (choice === '7') {
      await runPreset('diurnal', options)
    } else if (choice === '8') {
      const baseWeight = await fetchCurrentWeight(options.containerId)
      await runStream(options, baseWeight)
    } else if (choice === '9') {
      const tempStr = await question('Enter Temperature (°C) [e.g., 26.5]: ')
      const humStr = await question('Enter Humidity (%) [e.g., 68.0]: ')
      const t = parseFloat(tempStr.trim()) || 22.0
      const h = parseFloat(humStr.trim()) || 50.0
      const baseWeight = await fetchCurrentWeight(options.containerId)
      await sendClimateReading({
        deviceId: options.deviceId,
        containerId: options.containerId,
        weightGrams: baseWeight,
        temperatureC: t,
        humidityPercent: h,
      })
    } else {
      console.log('⚠️ Unknown option. Please choose between 0 and 9.')
    }
  }
}

function parseCommandLineArgs(): ClimateOptions {
  const args = process.argv.slice(2)
  const options: ClimateOptions = {
    containerId: DEFAULT_CONTAINER_ID,
    deviceId: DEFAULT_DEVICE_ID,
    intervalSeconds: 3,
    stream: false,
    once: false,
    interactive: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--temp' || arg === '-t') {
      if (args[i + 1]) options.temp = parseFloat(args[++i])
    } else if (arg === '--humidity' || arg === '-h') {
      if (args[i + 1]) options.humidity = parseFloat(args[++i])
    } else if (arg === '--preset' || arg === '-p') {
      if (args[i + 1]) options.preset = args[++i].toLowerCase() as ClimatePreset
    } else if (arg === '--weight' || arg === '-w') {
      if (args[i + 1]) options.weight = parseFloat(args[++i])
    } else if (arg === '--container' || arg === '-c') {
      if (args[i + 1]) options.containerId = args[++i]
    } else if (arg === '--device' || arg === '-d') {
      if (args[i + 1]) options.deviceId = args[++i]
    } else if (arg === '--interval') {
      if (args[i + 1]) options.intervalSeconds = Math.max(1, parseFloat(args[++i]))
    } else if (arg === '--steps' || arg === '-s') {
      if (args[i + 1]) options.steps = parseInt(args[++i], 10)
    } else if (arg === '--stream') {
      options.stream = true
    } else if (arg === '--once') {
      options.once = true
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true
    } else if (arg === '--ramp') {
      options.preset = 'ramp'
      if (args[i + 1] && !args[i + 1].startsWith('-')) options.rampStartTemp = parseFloat(args[++i])
      if (args[i + 1] && !args[i + 1].startsWith('-')) options.rampEndTemp = parseFloat(args[++i])
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
  }

  // If no arguments passed, launch interactive menu if TTY, or preset normal
  if (!options.preset && options.temp === undefined && options.humidity === undefined && !options.stream) {
    if (process.stdin.isTTY && args.length === 0) {
      options.interactive = true
    } else if (args.length === 0) {
      options.preset = 'normal'
    }
  }

  return options
}

function printHelp() {
  console.log(`
======================================================================
 SMART PANTRY: TEMPERATURE & HUMIDITY CLIMATE SIMULATOR
======================================================================
Simulates environmental climate telemetry from the DHT22 sensor,
triggering temperature and humidity alert thresholds and updating live charts.

UI Alert Thresholds:
  • Temperature High Alert:   > 25°C
  • Temperature Low Alert:    < 15°C
  • Humidity High Alert:      > 65% (Mold Risk)
  • Humidity Low Alert:       < 35% (Dry Air)

Usage:
  node scripts/simulateClimate.ts [options]
  npm run simulate:climate -- [options]

Presets:
  --preset normal             Optimal pantry conditions (22.4°C, 52% RH)
  --preset heatwave / hot     High temperature warning sequence (> 25°C)
  --preset cold               Cold room warning sequence (< 15°C)
  --preset humid              High humidity / mold risk sequence (> 65%)
  --preset dry                Dry air warning sequence (< 35%)
  --preset spoilage           Critical combined high heat + high humidity
  --preset diurnal            24-Hour Day/Night ambient temperature cycle
  --preset ramp <from> <to>   Ramp temperature linearly across steps

Options:
  --temp, -t <celsius>        Explicit temperature value in °C (e.g. --temp 28.5)
  --humidity, -h <percent>    Explicit humidity percentage (e.g. --humidity 72.0)
  --stream                    Continuously stream fluctuating climate data
  --interval <seconds>        Delay between telemetry readings (default: 3)
  --steps, -s <count>         Limit number of readings
  --container, -c <id>        Target container ID (default: container-01)
  --interactive, -i           Interactive CLI menu
  --help                      Show this help documentation

Examples:
  # Simulate heatwave warning (>25°C)
  node scripts/simulateClimate.ts --preset heatwave

  # Simulate mold risk high-humidity alert (>65%)
  node scripts/simulateClimate.ts --preset humid

  # Set explicit custom temperature and humidity
  node scripts/simulateClimate.ts --temp 29.5 --humidity 74.0

  # Continuous live oscillation for real-time chart animation
  node scripts/simulateClimate.ts --stream --interval 2

  # Launch interactive menu
  node scripts/simulateClimate.ts --interactive
`)
}

async function main() {
  const options = parseCommandLineArgs()

  if (options.interactive) {
    await runInteractiveMenu(options)
    return
  }

  const baseWeight = options.weight ?? (await fetchCurrentWeight(options.containerId))

  if (options.stream) {
    await runStream(options, baseWeight)
    return
  }

  if (options.preset) {
    await runPreset(options.preset, options)
    return
  }

  // Explicit values or fallback single reading
  const targetTemp = options.temp ?? 22.5
  const targetHumid = options.humidity ?? 55.0

  await sendClimateReading({
    deviceId: options.deviceId,
    containerId: options.containerId,
    weightGrams: baseWeight,
    temperatureC: targetTemp,
    humidityPercent: targetHumid,
  })
}

void main()
