import { GoogleGenAI } from '@google/genai'
import type {
  AIPantryAnalysis,
  CompactPantryContext,
} from './aiTypes.ts'

export interface GeminiServiceConfig {
  apiKey?: string
  modelName?: string
  mockMode?: boolean
}

export class GeminiAssistantService {
  private client: GoogleGenAI | null = null
  private modelName: string
  private mockMode: boolean

  constructor(config?: GeminiServiceConfig) {
    const apiKey = config?.apiKey || process.env.GEMINI_API_KEY
    this.modelName = config?.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    this.mockMode =
      config?.mockMode ??
      (process.env.NODE_ENV === 'test' ||
        process.env.GEMINI_MOCK === 'true' ||
        !apiKey)

    if (apiKey && !this.mockMode) {
      this.client = new GoogleGenAI({ apiKey })
    }
  }

  public isMockMode(): boolean {
    return this.mockMode
  }

  public getModelName(): string {
    return this.modelName
  }

  /**
   * Generates a grounded, structured pantry analysis using Gemini Flash.
   */
  async generatePantryAnalysis(context: CompactPantryContext): Promise<AIPantryAnalysis> {
    if (this.mockMode || !this.client) {
      return this.generateDeterministicAnalysis(context)
    }

    const systemPrompt = `You are a certified culinary and pantry storage expert assisting a Smart Pantry owner.
Analyze the provided pantry inventory, expiry dates, container scale readings, climate telemetry (DHT22), and active alerts.
RULES:
1. Ground all recommendations ONLY in the provided pantry facts and established food safety storage principles.
2. NEVER invent non-existent items, measured quantities, expiry dates, or sensor measurements.
3. If climate is outside optimal (Temp >25°C or <15°C; Humidity >65% or <35%), address it with specific storage advice.
4. If items are expiring soon (within 7 days), prioritize them in waste_reduction recommendations.
5. If sensor data is missing or stale, clearly record it under uncertainty_or_missing_data.
6. Return ONLY valid JSON adhering to the required schema.`

    const prompt = `CURRENT PANTRY FACTS:
Inventory Items (${context.items.length}):
${JSON.stringify(context.items, null, 2)}

Active Container Sensor Telemetry:
${JSON.stringify(context.sensorState || 'No sensor stream currently active', null, 2)}

Active System Alerts:
${JSON.stringify(context.activeAlerts, null, 2)}

Respond with a JSON object containing:
- summary: string (concise overview of current pantry health, climate, and immediate stock priority)
- recommendations: array of { id: string, type: 'storage'|'waste_reduction'|'shopping'|'general', title: string, advice: string, priority: 'high'|'medium'|'low', relatedItem?: string }
- warnings: array of string
- supporting_facts: array of string (concise verified observations from the provided data)
- uncertainty_or_missing_data: array of string`

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      })

      clearTimeout(timer)
      const text = response.text?.trim()
      if (!text) {
        throw new Error('Empty response from Gemini model.')
      }

      const parsed = JSON.parse(text)
      return {
        summary: String(parsed.summary || 'Pantry status analyzed.'),
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        supporting_facts: Array.isArray(parsed.supporting_facts) ? parsed.supporting_facts : [],
        uncertainty_or_missing_data: Array.isArray(parsed.uncertainty_or_missing_data)
          ? parsed.uncertainty_or_missing_data
          : [],
        generated_at: new Date().toISOString(),
        source: 'gemini',
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[GeminiService] Gemini API call failed, falling back to deterministic engine:', (err as Error).message)
      }
      return this.generateDeterministicAnalysis(context)
    }
  }

  /**
   * Responds to conversational user queries grounded in real pantry data.
   */
  async answerChatQuestion(
    context: CompactPantryContext,
    userMessage: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ response: string; supporting_facts: string[] }> {
    if (this.mockMode || !this.client) {
      return this.generateDeterministicChatResponse(context, userMessage)
    }

    const systemPrompt = `You are the Smart Pantry AI Assistant powered by Gemini.
You have authoritative access to the user's real pantry data (items, quantities, expiry dates, load-cell container weight, and DHT22 temperature/humidity).
STRICT RULES:
1. ONLY make claims supported by the verified pantry facts provided below.
2. NEVER invent inventory items, physical sensor measurements, or expiry dates.
3. Provide practical, concise, highly actionable culinary and food-storage advice.
4. When suggesting recipes, prioritize items that are expiring soon or already in stock.
5. If the user asks about an item not in the pantry, state clearly that it is not in stock.
6. Clearly distinguish verified measurements from advice or suggestions.`

    const contextBlock = `VERIFIED PANTRY SNAPSHOT:
- Items in Inventory: ${context.items.map((i) => `${i.name} (${i.quantity} ${i.unit}, category: ${i.category}, expires: ${i.expiryDate || 'none'}, container: ${i.containerId || 'unassigned'})`).join('; ') || 'No items currently tracked'}
- Container Hardware Sensor: ${context.sensorState ? `Weight: ${context.sensorState.currentWeight}g, Temp: ${context.sensorState.temperature}°C, Humidity: ${context.sensorState.humidity}%, Status: ${context.sensorState.sensorStatus}, Updated: ${context.sensorState.lastUpdated}` : 'No sensor connected'}
- Active Alerts: ${context.activeAlerts.map((a) => `${a.title}: ${a.message}`).join('; ') || 'None'}`

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

    // Inject history if provided
    if (history && history.length > 0) {
      for (const h of history.slice(-6)) {
        contents.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })
      }
    }

    // Append latest query with context
    contents.push({
      role: 'user',
      parts: [{ text: `${contextBlock}\n\nUSER QUESTION: ${userMessage}` }],
    })

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 12000)

      const res = await this.client.models.generateContent({
        model: this.modelName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: contents as any,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
        },
      })

      clearTimeout(timer)
      const text = res.text?.trim()
      if (!text) {
        throw new Error('Empty text response from Gemini chat.')
      }

      const supportingFacts: string[] = []
      if (context.sensorState) {
        supportingFacts.push(`Scale: ${context.sensorState.currentWeight}g (${context.sensorState.temperature}°C, ${context.sensorState.humidity}% RH)`)
      }
      if (context.items.length > 0) {
        supportingFacts.push(`${context.items.length} inventory item(s) tracked`)
      }

      return {
        response: text,
        supporting_facts: supportingFacts,
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[GeminiService] Chat API call failed, falling back to deterministic response:', (err as Error).message)
      }
      return this.generateDeterministicChatResponse(context, userMessage)
    }
  }

  /**
   * Deterministic, rule-based fallback for tests, offline mode, and API error resilience.
   * Fully grounded in real facts without hallucination.
   */
  private generateDeterministicAnalysis(context: CompactPantryContext): AIPantryAnalysis {
    const items = context.items || []
    const sensor = context.sensorState
    const warnings: string[] = []
    const supporting_facts: string[] = []
    const recommendations: AIPantryAnalysis['recommendations'] = []
    const uncertainty: string[] = []

    const now = new Date()

    // 1. Check climate thresholds
    if (sensor) {
      supporting_facts.push(`Live climate: ${sensor.temperature.toFixed(1)}°C, ${Math.round(sensor.humidity)}% relative humidity.`)
      supporting_facts.push(`Container measured weight: ${sensor.currentWeight}g on ${sensor.containerId}.`)

      if (sensor.temperature > 25) {
        warnings.push(`Ambient temperature is ${sensor.temperature.toFixed(1)}°C (exceeds recommended 25°C maximum). High heat accelerates grain oxidation and insect activity.`)
        recommendations.push({
          id: 'rec_temp_high',
          type: 'storage',
          title: 'Cool Down Storage Environment',
          advice: 'Move temperature-sensitive dry goods away from external walls, sunlight, or appliances to maintain grain quality.',
          priority: 'high',
        })
      } else if (sensor.temperature < 15) {
        warnings.push(`Pantry temperature is ${sensor.temperature.toFixed(1)}°C. Ensure condensation does not form when warmer ambient air enters.`)
      }

      if (sensor.humidity > 65) {
        warnings.push(`Humidity level is ${Math.round(sensor.humidity)}% (above 65% mold threshold). Excessive moisture risks fungal growth in flour and grains.`)
        recommendations.push({
          id: 'rec_hum_high',
          type: 'storage',
          title: 'Moisture Control & Airflow',
          advice: 'Store grains in airtight silicone-sealed containers with food-safe silica gel packets to prevent moisture absorption.',
          priority: 'high',
        })
      } else if (sensor.humidity < 35) {
        supporting_facts.push('Dry air conditions (<35% RH) prevent mold but can make dried pasta and crackers brittle.')
      }
    } else {
      uncertainty.push('No active container sensor telemetry detected. Environmental storage recommendations are based on standard pantry baselines.')
    }

    // 2. Expiry checks
    const expiringSoon: typeof items = []
    const expired: typeof items = []

    for (const item of items) {
      if (item.expiryDate) {
        const exp = new Date(item.expiryDate)
        const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < 0) {
          expired.push(item)
        } else if (diffDays <= 7) {
          expiringSoon.push(item)
        }
      }
    }

    if (expired.length > 0) {
      warnings.push(`${expired.length} item(s) past expiration date: ${expired.map((i) => i.name).join(', ')}.`)
      recommendations.push({
        id: 'rec_expired',
        type: 'waste_reduction',
        title: 'Inspect Expired Items',
        advice: `Carefully inspect ${expired.map((i) => i.name).join(', ')} for off-odors, discoloration, or pests before use.`,
        priority: 'high',
      })
    }

    if (expiringSoon.length > 0) {
      recommendations.push({
        id: 'rec_expiring_soon',
        type: 'waste_reduction',
        title: 'Prioritize Near-Expiry Ingredients',
        advice: `Plan meals around ${expiringSoon.map((i) => i.name).join(', ')} over the next 7 days to eliminate food waste.`,
        priority: 'medium',
        relatedItem: expiringSoon[0].name,
      })
    }

    // 3. Storage advice per item category
    for (const item of items) {
      if (item.category.toLowerCase().includes('grain') || item.name.toLowerCase().includes('rice')) {
        recommendations.push({
          id: `rec_grain_${item.id}`,
          type: 'storage',
          title: `Optimized Storage for ${item.name}`,
          advice: 'Keep tightly sealed in an airtight food-grade container away from moisture and light. Check container seal periodically.',
          priority: 'low',
          relatedItem: item.name,
        })
        break
      }
    }

    // Shopping list recommendation
    if (items.length === 0) {
      recommendations.push({
        id: 'rec_empty_pantry',
        type: 'shopping',
        title: 'Build Pantry Essentials',
        advice: 'Your pantry has no tracked items. Add kitchen staples (rice, beans, pasta, cooking oil) in the Inventory section.',
        priority: 'medium',
      })
    }

    const itemNamesList = items.map((i) => i.name).join(', ')
    const summary = items.length === 0
      ? 'Pantry is currently empty of tracked items. Add items to inventory to unlock personalized storage and freshness advice.'
      : `Pantry tracking ${items.length} item(s) (${itemNamesList}). Climate is currently ${sensor ? `${sensor.temperature.toFixed(1)}°C and ${Math.round(sensor.humidity)}% RH` : 'unmonitored'}. ${expiringSoon.length > 0 ? `${expiringSoon.length} item(s) require attention this week.` : 'Stock conditions are stable.'}`

    return {
      summary,
      recommendations,
      warnings,
      supporting_facts,
      uncertainty_or_missing_data: uncertainty,
      generated_at: now.toISOString(),
      source: 'mock-engine',
    }
  }

  private generateDeterministicChatResponse(
    context: CompactPantryContext,
    userMessage: string
  ): { response: string; supporting_facts: string[] } {
    const q = userMessage.toLowerCase()
    const items = context.items || []
    const sensor = context.sensorState
    const supporting_facts: string[] = []

    if (sensor) {
      supporting_facts.push(`Measured Weight: ${sensor.currentWeight}g | Climate: ${sensor.temperature.toFixed(1)}°C, ${Math.round(sensor.humidity)}% RH`)
    }

    // Question 1: What items do I have?
    if (q.includes('what') && (q.includes('item') || q.includes('have') || q.includes('stock'))) {
      if (items.length === 0) {
        return {
          response: 'You currently have no items recorded in your pantry inventory. You can add items on the **Inventory** page.',
          supporting_facts: ['0 items in inventory'],
        }
      }
      const list = items.map((i) => `• **${i.name}**: ${i.quantity} ${i.unit} (${i.category}${i.expiryDate ? `, exp: ${i.expiryDate}` : ''})`).join('\n')
      return {
        response: `Here are the items currently tracked in your pantry:\n\n${list}`,
        supporting_facts: [`${items.length} items verified`],
      }
    }

    // Question 2: Which items should I use first / expiry?
    if (q.includes('first') || q.includes('expire') || q.includes('waste') || q.includes('use')) {
      const sortedByExpiry = [...items]
        .filter((i) => i.expiryDate)
        .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())

      if (sortedByExpiry.length === 0) {
        return {
          response: 'None of your tracked items currently have an recorded expiry date. You can add expiration dates when editing items in the Inventory section.',
          supporting_facts: ['No recorded expiry dates in inventory'],
        }
      }

      const top = sortedByExpiry.slice(0, 3)
      const list = top.map((i) => `• **${i.name}** — Expiry: ${i.expiryDate}`).join('\n')
      return {
        response: `To minimize food waste, prioritize consuming these items first:\n\n${list}\n\nWould you like recipe ideas using any of these ingredients?`,
        supporting_facts: top.map((i) => `${i.name}: ${i.expiryDate}`),
      }
    }

    // Question 3: Recipe suggestion
    if (q.includes('recipe') || q.includes('cook') || q.includes('dinner') || q.includes('meal')) {
      if (items.length === 0) {
        return {
          response: 'I cannot suggest recipes yet because your pantry inventory is empty. Add a few pantry staples (such as rice, pasta, or beans) to get personalized meal suggestions!',
          supporting_facts: ['0 ingredients available'],
        }
      }
      const names = items.map((i) => i.name)
      return {
        response: `Based on your available ingredients (${names.join(', ')}), here is a simple recipe suggestion:\n\n**Pantry Comfort Bowl**\n1. Prepare **${names[0] || 'your grain'}** according to package instructions.\n2. ${names.length > 1 ? `Incorporate **${names[1]}** for texture and flavor.` : 'Season with olive oil, salt, and your favorite pantry spices.'}\n3. Serve warm. This makes great use of your existing stock!`,
        supporting_facts: [`Utilized: ${names.slice(0, 2).join(', ')}`],
      }
    }

    // Question 4: Sensor readings / climate
    if (q.includes('sensor') || q.includes('temperature') || q.includes('humidity') || q.includes('climate') || q.includes('reading')) {
      if (!sensor) {
        return {
          response: 'There is currently no active sensor telemetry stream detected from the ESP32 for container-01.',
          supporting_facts: ['No telemetry available'],
        }
      }
      const tempNote = sensor.temperature > 25 ? '⚠️ Temperature is elevated (>25°C)' : '✅ Temperature is within the optimal 15–25°C range.'
      const humNote = sensor.humidity > 65 ? '⚠️ Humidity is high (>65% RH, increased mold risk)' : '✅ Humidity is comfortable.'
      return {
        response: `Here is the current telemetry reading for **${sensor.containerId}**:\n\n• **Weight:** ${sensor.currentWeight} g\n• **Temperature:** ${sensor.temperature.toFixed(1)}°C (${tempNote})\n• **Humidity:** ${Math.round(sensor.humidity)}% (${humNote})\n• **Status:** ${sensor.sensorStatus}\n• **Last Reported:** ${sensor.lastUpdated}`,
        supporting_facts: [`Temp: ${sensor.temperature}°C`, `Humidity: ${sensor.humidity}%`, `Weight: ${sensor.currentWeight}g`],
      }
    }

    // Question 5: Storage advice
    if (q.includes('store') || q.includes('storage') || q.includes('keep') || q.includes('moisture')) {
      return {
        response: 'Here are essential pantry storage best practices:\n\n1. **Airtight Containers**: Use food-grade containers with rubber or silicone gaskets to block humidity and insects.\n2. **Cool, Dark Location**: Keep storage away from direct sunlight, ovens, or heat-producing appliances.\n3. **Humidity Control**: If pantry humidity exceeds 65%, use reusable silica gel packets inside grain containers.\n4. **First In, First Out (FIFO)**: Place newer groceries at the back and older packages in front.',
        supporting_facts: ['Standard pantry storage guidelines applied'],
      }
    }

    // Generic helpful pantry response
    return {
      response: `I'm here to assist with your pantry! Currently, you have **${items.length} item(s)** tracked${sensor ? ` and live container telemetry is reading **${sensor.currentWeight}g at ${sensor.temperature.toFixed(1)}°C**` : ''}.\n\nYou can ask me:\n• *"What items do I have?"*\n• *"Which items should I use first?"*\n• *"Suggest a recipe with my ingredients"*\n• *"Explain my latest sensor readings"*\n• *"How should I store my pantry items?"*`,
      supporting_facts: [`Items: ${items.length}`, ...(sensor ? [`Scale: ${sensor.currentWeight}g`] : [])],
    }
  }
}

export const geminiAssistantService = new GeminiAssistantService()
