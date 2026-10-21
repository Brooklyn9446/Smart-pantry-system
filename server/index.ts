import dotenv from 'dotenv'
import { createApp } from './app.ts'

dotenv.config({ path: '.env.local' })
dotenv.config()

const PORT = parseInt(process.env.PORT || '3001', 10)
const app = createApp()

app.listen(PORT, () => {
  console.log(`[SmartPantry Sensor Ingestion] Server listening on port ${PORT}`)
  console.log(`[SmartPantry Sensor Ingestion] Ingestion endpoint: http://localhost:${PORT}/api/sensors/reading`)
  console.log(`[SmartPantry Sensor Ingestion] Health check: http://localhost:${PORT}/api/health`)
})
