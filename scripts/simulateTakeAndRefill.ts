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
const DEFAULT_BASELINE_WEIGHT = 2500
const SIGNIFICANT_CHANGE_THRESHOLD = 50 // grams threshold for Phase 6 event detection

interface TakeAndRefillOptions {
  action?: 'take' | 'refill' | 'weight' | 'scenario' | 'history' | 'status' | 'interactive'
  amount?: number
  targetWeight?: number
  itemName?: string
  containerId: string
  deviceId: string
  days?: number
  steps?: number
  delaySeconds: number
  temp?: number
  humidity?: number
  interactive: boolean
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
 * Fetch current state of container from the ingestion server.
 */
async function fetchCurrentContainerState(containerId: string): Promise<{
  weight: number
  temp: number
  humidity: number
}> {
  try {
    const res = await fetch(`${CURRENT_STATE_ENDPOINT}/${containerId}`)
    if (res.ok) {
      const data = (await res.json()) as CurrentStateResponse
      if (data.state && typeof data.state.currentWeight === 'number') {
        return {
          weight: data.state.currentWeight,
          temp: typeof data.state.temperature === 'number' ? data.state.temperature : 22.5,
          humidity: typeof data.state.humidity === 'number' ? data.state.humidity : 55.0,
        }
      }
    }
  } catch {
    // Ingestion server may be running in test mode or container has not received readings yet
  }

  return {
    weight: DEFAULT_BASELINE_WEIGHT,
    temp: 22.5,
    humidity: 55.0,
  }
}

/**
 * Send sensor telemetry payload to the ingestion endpoint.
 */
async function sendSensorReading(params: {
  deviceId: string
  containerId: string
  weightGrams: number
  temperatureC: number
  humidityPercent: number
  customTimestamp?: string
  label?: string
}): Promise<{ ok: boolean; readingId?: string; weight: number }> {
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
    firmwareVersion: 'v1.1.0-action-sim',
    sequenceNumber: sequenceNumber++,
  }

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
      const errText = await res.text()
      console.error(`  ❌ HTTP ${res.status} Error: ${errText}`)
      return { ok: false, weight: roundedWeight }
    }

    const data = (await res.json()) as { readingId?: string }
    return { ok: true, readingId: data.readingId, weight: roundedWeight }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ❌ Connection to ${INGESTION_ENDPOINT} failed: ${msg}`)
    console.error('     Please ensure your server is running (`npm run server` or `node server/index.ts`).')
    return { ok: false, weight: roundedWeight }
  }
}

/**
 * Simulate taking an item from the container (Consumption / Weight Reduction).
 */
async function simulateTake(
  amountGrams: number,
  options: TakeAndRefillOptions
): Promise<number> {
  const current = await fetchCurrentContainerState(options.containerId)
  const prevWeight = current.weight
  const newWeight = Math.max(0, Math.round((prevWeight - amountGrams) * 10) / 10)
  const delta = Math.round((newWeight - prevWeight) * 10) / 10
  const itemName = options.itemName ? `"${options.itemName}"` : `item in ${options.containerId}`

  console.log(`\n🥣 [TAKE ITEM] Taking ${amountGrams}g of ${itemName}...`)
  console.log(`   Previous Weight: ${prevWeight}g`)
  console.log(`   New Weight:      ${newWeight}g (Δ = ${delta}g)`)

  if (Math.abs(delta) >= SIGNIFICANT_CHANGE_THRESHOLD) {
    console.log(`   ⚡ Status: Detected as a FOOD CONSUMPTION EVENT (Δ >= 50g)`)
  } else {
    console.log(`   ℹ️  Status: Minor change / load cell noise (< 50g threshold)`)
  }

  const result = await sendSensorReading({
    deviceId: options.deviceId,
    containerId: options.containerId,
    weightGrams: newWeight,
    temperatureC: options.temp ?? current.temp,
    humidityPercent: options.humidity ?? current.humidity,
    label: `Take ${amountGrams}g`,
  })

  if (result.ok) {
    console.log(`   ✅ Ingested successfully (Reading ID: ${result.readingId})`)
  }
  return newWeight
}

/**
 * Simulate refilling an item in the container (Replenishment / Weight Increase).
 */
async function simulateRefill(
  amountGrams: number,
  options: TakeAndRefillOptions
): Promise<number> {
  const current = await fetchCurrentContainerState(options.containerId)
  const prevWeight = current.weight
  // Max load cell is 15,000g
  const newWeight = Math.min(15000, Math.round((prevWeight + amountGrams) * 10) / 10)
  const delta = Math.round((newWeight - prevWeight) * 10) / 10
  const itemName = options.itemName ? `"${options.itemName}"` : `item in ${options.containerId}`

  console.log(`\n📦 [REFILL ITEM] Refilling +${amountGrams}g of ${itemName}...`)
  console.log(`   Previous Weight: ${prevWeight}g`)
  console.log(`   New Weight:      ${newWeight}g (Δ = +${delta}g)`)

  if (delta >= SIGNIFICANT_CHANGE_THRESHOLD) {
    console.log(`   ⚡ Status: Detected as a REFILL EVENT (Δ >= +50g, resets consumption baseline)`)
  } else {
    console.log(`   ℹ️  Status: Minor increase / load cell noise (< 50g threshold)`)
  }

  const result = await sendSensorReading({
    deviceId: options.deviceId,
    containerId: options.containerId,
    weightGrams: newWeight,
    temperatureC: options.temp ?? current.temp,
    humidityPercent: options.humidity ?? current.humidity,
    label: `Refill +${amountGrams}g`,
  })

  if (result.ok) {
    console.log(`   ✅ Ingested successfully (Reading ID: ${result.readingId})`)
  }
  return newWeight
}

/**
 * Set container to a specific target weight.
 */
async function simulateSetWeight(
  targetWeight: number,
  options: TakeAndRefillOptions
): Promise<number> {
  const current = await fetchCurrentContainerState(options.containerId)
  const prevWeight = current.weight
  const delta = Math.round((targetWeight - prevWeight) * 10) / 10

  console.log(`\n🎯 [SET WEIGHT] Setting container weight to ${targetWeight}g...`)
  console.log(`   Previous Weight: ${prevWeight}g`)
  console.log(`   New Weight:      ${targetWeight}g (Δ = ${delta > 0 ? `+${delta}` : delta}g)`)

  if (delta <= -SIGNIFICANT_CHANGE_THRESHOLD) {
    console.log(`   ⚡ Status: Triggers CONSUMPTION event (${Math.abs(delta)}g taken)`)
  } else if (delta >= SIGNIFICANT_CHANGE_THRESHOLD) {
    console.log(`   ⚡ Status: Triggers REFILL event (+${delta}g replenished)`)
  }

  const result = await sendSensorReading({
    deviceId: options.deviceId,
    containerId: options.containerId,
    weightGrams: targetWeight,
    temperatureC: options.temp ?? current.temp,
    humidityPercent: options.humidity ?? current.humidity,
  })

  if (result.ok) {
    console.log(`   ✅ Ingested successfully (Reading ID: ${result.readingId})`)
  }
  return targetWeight
}

/**
 * Run an automated scenario pattern demonstrating taking and refilling events.
 */
async function runScenarioCycle(options: TakeAndRefillOptions) {
  const steps = [
    { type: 'take', amount: 150, desc: 'Breakfast: Took 150g for morning oats' },
    { type: 'take', amount: 300, desc: 'Lunch: Took 300g for meal preparation' },
    { type: 'refill', amount: 1500, desc: 'Restock: Grocery shopping refill of +1500g' },
    { type: 'take', amount: 200, desc: 'Dinner: Took 200g portion' },
    { type: 'take', amount: 80, desc: 'Snack: Took 80g snack portion' },
    { type: 'refill', amount: 800, desc: 'Pantry top-up: Refilled +800g pack' },
  ]

  console.log('\n======================================================================')
  console.log(' 🎬 RUNNING AUTOMATED PANTRY TAKE & REFILL SCENARIO')
  console.log(` Container: ${options.containerId} | Delay: ${options.delaySeconds}s per step`)
  console.log('======================================================================')

  const count = options.steps ? Math.min(options.steps, steps.length) : steps.length

  for (let i = 0; i < count; i++) {
    const step = steps[i]
    console.log(`\n--- Step ${i + 1}/${count}: ${step.desc} ---`)
    if (step.type === 'take') {
      await simulateTake(step.amount, options)
    } else {
      await simulateRefill(step.amount, options)
    }

    if (i < count - 1) {
      console.log(`⏳ Waiting ${options.delaySeconds}s before next action...`)
      await new Promise((resolve) => setTimeout(resolve, options.delaySeconds * 1000))
    }
  }

  console.log('\n🎉 Scenario cycle complete! Check the Live Monitoring or ML Predictions dashboard.')
}

/**
 * Check and display current container telemetry.
 */
async function displayContainerStatus(containerId: string) {
  console.log(`\n🔍 Fetching latest status for container "${containerId}"...`)
  const current = await fetchCurrentContainerState(containerId)
  console.log('--------------------------------------------------')
  console.log(`  Container:   ${containerId}`)
  console.log(`  Weight:      ${current.weight} g`)
  console.log(`  Temperature: ${current.temp} °C`)
  console.log(`  Humidity:    ${current.humidity} %`)
  console.log('--------------------------------------------------')
}

/**
 * Interactive menu mode.
 */
/**
 * Seed realistic multi-day historical telemetry for ML Depletion Model forecasting.
 * Generates spaced historical data points over multiple days with daily consumption
 * and a mid-week refill, fulfilling the ML model's min-span (>= 30 min) and count (>= 3) requirements.
 */
async function seedHistoricalReadings(options: TakeAndRefillOptions, days: number = 5) {
  console.log('\n======================================================================')
  console.log(` 🧠 SEEDING ${days}-DAY REALISTIC CONSUMPTION HISTORY FOR ML PREDICTION`)
  console.log(` Container: ${options.containerId} | Target: ${INGESTION_ENDPOINT}`)
  console.log('======================================================================')

  const nowMs = Date.now()
  // Historical sequence over the last 5 days
  const historySequence = [
    { daysAgo: 5.0, weight: 3500, label: 'Day -5 Baseline stock: 3500g' },
    { daysAgo: 4.5, weight: 3350, label: 'Day -5 Dinner: -150g' },
    { daysAgo: 4.0, weight: 3100, label: 'Day -4 Daily meals: -250g' },
    { daysAgo: 3.0, weight: 2850, label: 'Day -3 Daily meals: -250g' },
    { daysAgo: 2.2, weight: 4850, label: 'Day -2 Bulk Grocery Refill: +2000g' },
    { daysAgo: 2.0, weight: 4600, label: 'Day -2 Dinner: -250g' },
    { daysAgo: 1.0, weight: 4350, label: 'Day -1 Daily meals: -250g' },
    { daysAgo: 0.5, weight: 4200, label: '12h ago Lunch: -150g' },
    { daysAgo: 0.05, weight: 4050, label: '1h ago Snack: -150g' },
    { daysAgo: 0, weight: 3950, label: 'Current State: 3950g' },
  ]

  for (let i = 0; i < historySequence.length; i++) {
    const item = historySequence[i]
    const timestamp = new Date(nowMs - item.daysAgo * 86400 * 1000).toISOString()
    console.log(`📡 Ingesting [${i + 1}/${historySequence.length}]: ${item.label}`)
    console.log(`   Weight: ${item.weight}g | Timestamp: ${timestamp}`)
    await sendSensorReading({
      deviceId: options.deviceId,
      containerId: options.containerId,
      weightGrams: item.weight,
      temperatureC: 22.5,
      humidityPercent: 55.0,
      customTimestamp: timestamp,
      label: item.label,
    })
    await new Promise((r) => setTimeout(r, 150))
  }

  console.log('\n======================================================================')
  console.log(' ✅ Multi-day history seeded successfully!')
  console.log('    • Observation window: ~5 days (satisfies ML 30-min min span requirement)')
  console.log('    • Observation count:  10 distinct readings (satisfies min 3 readings requirement)')
  console.log('    • Consumption rate:   ~250 g/day')
  console.log('    • Refill handling:    Includes mid-week grocery restock (+2000g)')
  console.log(' 👉 Check the "ML Predictions" tab in your browser and click "Recompute Model"!')
  console.log('======================================================================')
}

/**
 * Interactive menu mode.
 */
async function runInteractiveMenu(options: TakeAndRefillOptions) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const question = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve))

  while (true) {
    const current = await fetchCurrentContainerState(options.containerId)
    console.log('\n======================================================================')
    console.log(' 🍱 SMART PANTRY - TAKE & REFILL SIMULATOR')
    console.log(` Container: ${options.containerId} | Current Weight: ${current.weight}g`)
    console.log('======================================================================')
    console.log('  1. 🥣 Take item (e.g., consume 100g, 250g, 500g)')
    console.log('  2. 📦 Refill item (e.g., replenish +500g, +1000g, +2000g)')
    console.log('  3. 🎯 Set exact weight (e.g., reset to 2500g)')
    console.log('  4. 🎬 Run automated multi-action scenario cycle')
    console.log('  5. 🧠 Seed multi-day history for ML Prediction model')
    console.log('  6. 📊 Inspect container status')
    console.log('  0. 🚪 Exit')
    console.log('----------------------------------------------------------------------')

    const choice = (await question('Select an option (0-6): ')).trim()

    if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log('Exiting simulator. Have a great day! 👋')
      rl.close()
      break
    }

    if (choice === '1') {
      const valStr = await question('Enter grams to TAKE [default: 250]: ')
      const grams = parseFloat(valStr.trim()) || 250
      await simulateTake(grams, options)
    } else if (choice === '2') {
      const valStr = await question('Enter grams to REFILL [default: 1000]: ')
      const grams = parseFloat(valStr.trim()) || 1000
      await simulateRefill(grams, options)
    } else if (choice === '3') {
      const valStr = await question('Enter target WEIGHT in grams [e.g., 2500]: ')
      const target = parseFloat(valStr.trim())
      if (!Number.isNaN(target) && target >= 0) {
        await simulateSetWeight(target, options)
      } else {
        console.log('❌ Invalid weight entered.')
      }
    } else if (choice === '4') {
      await runScenarioCycle(options)
    } else if (choice === '5') {
      await seedHistoricalReadings(options, options.days ?? 5)
    } else if (choice === '6') {
      await displayContainerStatus(options.containerId)
    } else {
      console.log('⚠️ Unknown option. Please choose between 0 and 6.')
    }
  }
}

function parseCommandLineArgs(): TakeAndRefillOptions {
  const args = process.argv.slice(2)
  const options: TakeAndRefillOptions = {
    containerId: DEFAULT_CONTAINER_ID,
    deviceId: DEFAULT_DEVICE_ID,
    delaySeconds: 2,
    interactive: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--take' || arg === '-t') {
      options.action = 'take'
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options.amount = parseFloat(args[++i])
      } else {
        options.amount = 250
      }
    } else if (arg === '--refill' || arg === '-r') {
      options.action = 'refill'
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options.amount = parseFloat(args[++i])
      } else {
        options.amount = 1000
      }
    } else if (arg === '--weight' || arg === '-w') {
      options.action = 'weight'
      if (args[i + 1]) {
        options.targetWeight = parseFloat(args[++i])
      }
    } else if (arg === '--scenario' || arg === '--cycle') {
      options.action = 'scenario'
    } else if (arg === '--history' || arg === '--seed-history') {
      options.action = 'history'
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        options.days = parseInt(args[++i], 10)
      }
    } else if (arg === '--status') {
      options.action = 'status'
    } else if (arg === '--item' || arg === '-n') {
      if (args[i + 1]) options.itemName = args[++i]
    } else if (arg === '--container' || arg === '-c') {
      if (args[i + 1]) options.containerId = args[++i]
    } else if (arg === '--device' || arg === '-d') {
      if (args[i + 1]) options.deviceId = args[++i]
    } else if (arg === '--steps' || arg === '-s') {
      if (args[i + 1]) options.steps = parseInt(args[++i], 10)
    } else if (arg === '--delay') {
      if (args[i + 1]) options.delaySeconds = Math.max(1, parseFloat(args[++i]))
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  // If no action specified and no CLI arguments provided, default to interactive if TTY or print help
  if (!options.action && !options.interactive) {
    if (process.stdin.isTTY && args.length === 0) {
      options.interactive = true
    } else if (args.length === 0) {
      // In non-interactive environment without args, run a sample take action
      options.action = 'take'
      options.amount = 250
    }
  }

  return options
}

function printHelp() {
  console.log(`
======================================================================
 SMART PANTRY: TAKE & REFILL SIMULATOR
======================================================================
Simulates consuming (taking) or refilling pantry items for load-cell
monitoring, consumption analytics, and refill-aware ML models.

Usage:
  node scripts/simulateTakeAndRefill.ts [options]
  npm run simulate:action -- [options]

Options:
  --take, -t <grams>       Simulate taking food/item (weight reduction)
                           e.g., --take 300
  --refill, -r <grams>     Simulate refilling item (weight replenishment)
                           e.g., --refill 1500
  --weight, -w <grams>     Directly set container weight to exact value
  --item, -n <name>        Optional item name label (e.g. "Rice", "Cereal")
  --scenario, --cycle      Run automated multi-action take & refill scenario
  --history, --seed-history Seed multi-day consumption history for ML prediction
  --steps <count>          Number of scenario steps to execute
  --delay <seconds>        Delay between steps in scenario (default: 2)
  --status                 Fetch and show container's current live weight
  --container, -c <id>     Target container ID (default: container-01)
  --interactive, -i        Launch interactive terminal prompt
  --help, -h               Show this help message

Examples:
  # Seed multi-day history to activate ML Depletion predictions immediately
  node scripts/simulateTakeAndRefill.ts --seed-history

  # Take 200g of cereal
  node scripts/simulateTakeAndRefill.ts --take 200 --item "Cereal"

  # Refill pantry container with 2000g of rice
  node scripts/simulateTakeAndRefill.ts --refill 2000 --item "Basmati Rice"

  # Run automated scenario cycle
  node scripts/simulateTakeAndRefill.ts --scenario

  # Launch interactive CLI
  node scripts/simulateTakeAndRefill.ts --interactive
`)
}

async function main() {
  const options = parseCommandLineArgs()

  if (options.interactive) {
    await runInteractiveMenu(options)
    return
  }

  switch (options.action) {
    case 'take':
      await simulateTake(options.amount ?? 250, options)
      break
    case 'refill':
      await simulateRefill(options.amount ?? 1000, options)
      break
    case 'weight':
      await simulateSetWeight(options.targetWeight ?? 2500, options)
      break
    case 'scenario':
      await runScenarioCycle(options)
      break
    case 'history':
      await seedHistoricalReadings(options, options.days ?? 5)
      break
    case 'status':
      await displayContainerStatus(options.containerId)
      break
    default:
      printHelp()
  }
}

void main()

