import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const ENDPOINT = process.env.INGESTION_URL || 'http://localhost:3001/api/sensors/reading'
const DEVICE_TOKEN = process.env.DEVICE_AUTH_TOKEN || 'pantry-device-token-secret-2026'
const DEVICE_ID = 'device-01'
const CONTAINER_ID = 'container-01'

interface SimulationOptions {
  once: boolean
  pattern: boolean
  intervalSeconds: number
  baseWeight: number
  baseTemp: number
  baseHumidity: number
  consumeGrams?: number
  refillGrams?: number
}

function parseArgs(): SimulationOptions {
  const args = process.argv.slice(2)
  const options: SimulationOptions = {
    once: args.includes('--once'),
    pattern: args.includes('--pattern'),
    intervalSeconds: 15,
    baseWeight: 2450,
    baseTemp: 22.8,
    baseHumidity: 56.5,
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      options.intervalSeconds = Math.max(2, parseInt(args[i + 1], 10))
    }
    if (args[i] === '--weight' && args[i + 1]) {
      options.baseWeight = parseFloat(args[i + 1])
    }
    if (args[i] === '--temp' && args[i + 1]) {
      options.baseTemp = parseFloat(args[i + 1])
    }
    if (args[i] === '--humidity' && args[i + 1]) {
      options.baseHumidity = parseFloat(args[i + 1])
    }
    if (args[i] === '--consume' && args[i + 1]) {
      options.consumeGrams = parseFloat(args[i + 1])
    }
    if (args[i] === '--refill' && args[i + 1]) {
      options.refillGrams = parseFloat(args[i + 1])
    }
  }

  if (options.consumeGrams !== undefined) {
    options.baseWeight = Math.max(0, options.baseWeight - options.consumeGrams)
    options.once = true
  } else if (options.refillGrams !== undefined) {
    options.baseWeight = options.baseWeight + options.refillGrams
    options.once = true
  }

  return options
}

let sequence = 1

async function sendPayload(weightGrams: number, temperatureC: number, humidityPercent: number, customTimestamp?: string) {
  const payload = {
    deviceId: DEVICE_ID,
    containerId: CONTAINER_ID,
    timestamp: customTimestamp || new Date().toISOString(),
    weightGrams: Math.round(weightGrams * 10) / 10,
    temperatureC: Math.round(temperatureC * 10) / 10,
    humidityPercent: Math.round(humidityPercent * 10) / 10,
    sensorStatus: 'simulated' as const,
    rawWeightGrams: Math.round((weightGrams + 350) * 10) / 10,
    firmwareVersion: 'v1.0.0-sim',
    sequenceNumber: sequence++,
  }

  console.log(`\n[Sensor Simulator] 📡 Sending reading #${payload.sequenceNumber} to ${ENDPOINT}...`)
  console.log(`                   Weight: ${payload.weightGrams}g | Temp: ${payload.temperatureC}°C | Humidity: ${payload.humidityPercent}%`)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': DEVICE_TOKEN,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`[Sensor Simulator] ❌ HTTP Error ${res.status}: ${errBody}`)
    } else {
      const data = await res.json()
      console.log(`[Sensor Simulator]  HTTP ${res.status} OK (Reading ID: ${data.readingId})`)
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[Sensor Simulator] ❌ Network failed to reach ${ENDPOINT}: ${errorMsg}. Make sure ingestion server is running (npm run server).`)
  }
}

async function sendReading(options: SimulationOptions) {
  const weightNoise = (Math.random() - 0.5) * 4.0 // ±2g noise
  const tempNoise = (Math.random() - 0.5) * 0.4
  const humidityNoise = (Math.random() - 0.5) * 1.5

  const weightGrams = Math.max(0, options.baseWeight + weightNoise)
  const temperatureC = options.baseTemp + tempNoise
  const humidityPercent = Math.min(100, Math.max(0, options.baseHumidity + humidityNoise))

  await sendPayload(weightGrams, temperatureC, humidityPercent)
}

async function runScenarioPattern() {
  console.log('\n[Sensor Simulator] 🎬 Running Phase 6 Scenario Pattern...')
  const now = Date.now()

  // Step 1: Initial baseline
  console.log('--- Step 1: Baseline 3000g ---')
  await sendPayload(3000, 22.5, 55.0, new Date(now - 120000).toISOString())
  await new Promise((r) => setTimeout(r, 500))

  // Step 2: Minor noise (no event)
  console.log('--- Step 2: Noise fluctuation 2998g ---')
  await sendPayload(2998, 22.5, 55.2, new Date(now - 90000).toISOString())
  await new Promise((r) => setTimeout(r, 500))

  // Step 3: Consumption -300g
  console.log('--- Step 3: Consumption 2700g (-300g event) ---')
  await sendPayload(2700, 22.6, 54.8, new Date(now - 60000).toISOString())
  await new Promise((r) => setTimeout(r, 500))

  // Step 4: Refill +2000g
  console.log('--- Step 4: Refill 4700g (+2000g refill event) ---')
  await sendPayload(4700, 22.4, 56.0, new Date(now - 30000).toISOString())
  await new Promise((r) => setTimeout(r, 500))

  // Step 5: Second consumption -250g
  console.log('--- Step 5: Second Consumption 4450g (-250g event) ---')
  await sendPayload(4450, 22.5, 55.5, new Date(now).toISOString())

  console.log('\n Scenario Pattern Complete! Check #live-monitoring to see the detected events and charts.')
}

async function main() {
  const options = parseArgs()
  console.log('='.repeat(70))
  console.log(' SMART PANTRY SENSOR SIMULATOR (Phase 6 Tool)')
  console.log(`Target: ${ENDPOINT}`)
  console.log(`Device: ${DEVICE_ID} -> Container: ${CONTAINER_ID}`)
  console.log(`Mode:   ${options.pattern ? 'Phase 6 Scenario Pattern' : options.once ? 'Single shot' : `Streaming every ${options.intervalSeconds}s`}`)
  console.log('='.repeat(70))

  if (options.pattern) {
    await runScenarioPattern()
    return
  }

  await sendReading(options)

  if (!options.once) {
    setInterval(() => {
      void sendReading(options)
    }, options.intervalSeconds * 1000)
  }
}

void main()
