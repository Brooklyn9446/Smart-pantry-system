import { useEffect, useMemo, useRef, useState } from 'react'
import { useAlerts } from '../../context/useAlerts'
import { useInventory } from '../../context/useInventory'
import { useSensors } from '../../context/useSensors'
import { aiRepository } from '../../data/aiRepository'
import type { AIPantryAnalysis, ChatMessage } from '../../types/ai'

const SUGGESTED_PROMPTS = [
  'Which ingredients should I prioritize before they expire?',
  'How do our current humidity and temperature levels affect dry storage?',
  'What staples am I running lowest on right now?',
  'Can you suggest a quick recipe using the items currently in stock?',
]

export function AIPantryAssistantPage() {
  const { items } = useInventory()
  const { currentState, netFoodWeightGrams, deviceStatus } = useSensors()
  const { alerts } = useAlerts()

  // AI Analysis State
  const [analysis, setAnalysis] = useState<AIPantryAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Hello! I am your Gemini-powered Smart Pantry Assistant. I can analyze your pantry inventory, scale weight readings, and climate telemetry to help reduce waste, optimize storage conditions, and keep food fresh.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      supporting_facts: ['Grounded in live sensor telemetry & inventory records'],
    },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isChatSubmitting, setIsChatSubmitting] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Build client context fallback snapshot in case server runs without direct Firestore creds
  const clientContextFallback = useMemo(() => {
    return {
      userId: localStorage.getItem('pantry_user_id') || 'local-user',
      timestamp: new Date().toISOString(),
      items: (items || []).map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        quantity: i.initialQuantity,
        unit: i.quantityUnit,
        expiryDate: i.expiryDate,
        containerId: i.containerId,
      })),
      sensorState: currentState
        ? {
            containerId: currentState.containerId,
            currentWeight: currentState.currentWeight,
            weightUnit: currentState.weightUnit || 'g',
            temperature: currentState.temperature,
            humidity: currentState.humidity,
            lastUpdated: currentState.lastUpdated,
            sensorStatus: currentState.sensorStatus || 'ok',
          }
        : null,
      activeAlerts: (alerts || [])
        .filter((a) => a.status === 'active')
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          message: a.message,
          severity: a.severity,
        })),
    }
  }, [items, currentState, alerts])

  // 1. Fetch cached analysis on mount without invoking Gemini
  useEffect(() => {
    let isMounted = true
    aiRepository.getCachedRecommendations().then((res) => {
      if (!isMounted) return
      if (res.cached && res.analysis) {
        setAnalysis(res.analysis)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownRemaining])

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, isChatSubmitting])

  const handleRunAnalysis = async () => {
    if (isAnalyzing || cooldownRemaining > 0) return
    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const res = await aiRepository.runAnalysis(true, clientContextFallback)
      if (res.success && res.analysis) {
        setAnalysis(res.analysis)
        setCooldownRemaining(10) // 10s cooldown
      } else {
        setAnalysisError(res.error || 'Failed to complete pantry analysis')
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis request failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSendChat = async (messageToSend?: string) => {
    const text = (messageToSend ?? inputMessage).trim()
    if (!text || isChatSubmitting) return

    setInputMessage('')
    setChatError(null)

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setIsChatSubmitting(true)

    // Build recent conversation history
    const historyPayload = messages
      .filter((m) => m.id !== 'welcome-msg')
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }))

    try {
      const res = await aiRepository.sendChat(text, historyPayload, clientContextFallback)
      if (res.success && res.response) {
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          supporting_facts: res.supporting_facts,
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        setChatError(res.error || 'Failed to receive assistant response')
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Error sending message')
    } finally {
      setIsChatSubmitting(false)
    }
  }

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-msg',
        role: 'assistant',
        content: 'Chat conversation reset. Ask any question about your pantry!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    setChatError(null)
  }

  const sourceBadge = useMemo(() => {
    if (!analysis) return null
    if (analysis.source === 'gemini') {
      return <span className="badge badge-gemini">✦ Gemini AI</span>
    }
    if (analysis.source === 'cache') {
      return <span className="badge badge-cache">⚡ Cached</span>
    }
    return <span className="badge badge-mock">⚙ Offline Rules</span>
  }, [analysis])

  return (
    <main className="main-content">
      <div className="topbar">
        <div>
          <p className="eyebrow">Smart Kitchen Intelligence</p>
          <h1>AI Pantry Assistant</h1>
          <p className="subtitle">
            Grounded food storage advice, waste-reduction guidance, and intelligent conversational insights powered by Gemini.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing || cooldownRemaining > 0}
            title={cooldownRemaining > 0 ? `Analysis ready in ${cooldownRemaining}s` : 'Analyze current pantry state'}
          >
            {isAnalyzing ? (
              'Analyzing...'
            ) : cooldownRemaining > 0 ? (
              `Cooldown (${cooldownRemaining}s)`
            ) : (
              '✦ Run Fresh Analysis'
            )}
          </button>
        </div>
      </div>

      <div className="ai-assistant-page">
        {/* Real-time Context Strip */}
        <div className="ai-context-strip" aria-label="Grounded Telemetry Context">
          <div className="ai-context-pill">
            <span className="icon">▦</span>
            <span>Items Tracked:</span>
            <span className="metric-val">{items.length}</span>
          </div>

          <div className="ai-context-pill">
            <span className="icon">⚖</span>
            <span>Live Scale Weight:</span>
            <span className="metric-val">
              {netFoodWeightGrams > 0 ? `${netFoodWeightGrams.toLocaleString()} g` : 'No active load'}
            </span>
          </div>

          <div className="ai-context-pill">
            <span className="icon">🌡</span>
            <span>Ambient Climate:</span>
            <span className="metric-val">
              {currentState ? `${currentState.temperature.toFixed(1)}°C | ${Math.round(currentState.humidity)}% RH` : 'Awaiting sensor'}
            </span>
          </div>

          <div className="ai-context-pill">
            <span className="icon">⌁</span>
            <span>Sensor Status:</span>
            <span className="metric-val" style={{ textTransform: 'capitalize' }}>
              {deviceStatus}
            </span>
          </div>
        </div>

        {analysisError && (
          <div className="inventory-feedback error" role="alert">
            <strong>Analysis Notice:</strong> {analysisError}
          </div>
        )}

        <div className="ai-grid-layout">
          {/* LEFT: Storage & Freshness Intelligence */}
          <section className="ai-card" aria-labelledby="insights-heading">
            <div className="ai-card-header">
              <h2 id="insights-heading" className="ai-card-title">
                Pantry Health & Storage Insights
                {sourceBadge}
              </h2>
              {analysis && (
                <span style={{ fontSize: 11, color: '#718078' }}>
                  Updated {new Date(analysis.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {analysis ? (
              <>
                <div className="ai-summary-box">
                  <strong>Overview: </strong>
                  {analysis.summary}
                </div>

                {analysis.warnings && analysis.warnings.length > 0 && (
                  <div className="ai-warning-box">
                    <strong>⚠️ Storage & Spoilage Warnings</strong>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {analysis.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: '#16332a' }}>
                    Actionable Recommendations
                  </h3>
                  <div className="ai-recs-list">
                    {analysis.recommendations && analysis.recommendations.length > 0 ? (
                      analysis.recommendations.map((rec) => (
                        <article key={rec.id} className="ai-rec-card">
                          <div className="ai-rec-header">
                            <span className={`ai-rec-tag ${rec.type}`}>
                              {rec.type.replace('_', ' ')}
                            </span>
                            <span className={`ai-priority-badge ${rec.priority}`}>
                              {rec.priority} priority
                            </span>
                          </div>
                          <h4 className="ai-rec-title">{rec.title}</h4>
                          <p className="ai-rec-advice">{rec.advice}</p>
                          {rec.relatedItem && (
                            <span style={{ fontSize: 11, color: '#688478', fontStyle: 'italic' }}>
                              Applies to: {rec.relatedItem}
                            </span>
                          )}
                        </article>
                      ))
                    ) : (
                      <p style={{ color: '#718078', fontSize: 13 }}>No active storage risks detected.</p>
                    )}
                  </div>
                </div>

                {analysis.supporting_facts && analysis.supporting_facts.length > 0 && (
                  <div style={{ fontSize: 12, color: '#617d72' }}>
                    <strong>Sensor grounding: </strong>
                    {analysis.supporting_facts.join(' • ')}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#688478' }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>✦</span>
                <p style={{ margin: '0 0 14px', fontSize: 14 }}>
                  No pantry analysis has been generated for this session yet.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? 'Analyzing...' : 'Generate Analysis Now'}
                </button>
              </div>
            )}
          </section>

          {/* RIGHT: Conversational Pantry Assistant */}
          <section className="ai-card ai-chat-container" aria-labelledby="chat-heading">
            <div className="ai-card-header">
              <h2 id="chat-heading" className="ai-card-title">
                Ask Gemini Pantry Assistant
              </h2>
              <button
                type="button"
                className="text-button"
                onClick={handleClearChat}
                title="Clear conversation history"
              >
                Clear Chat
              </button>
            </div>

            {/* Chat History */}
            <div className="ai-chat-messages" ref={chatScrollRef} role="log" aria-live="polite">
              {messages.map((m) => (
                <div key={m.id} className={`ai-chat-msg ${m.role}`}>
                  <div className={`ai-bubble ai-bubble-${m.role}`}>
                    {m.content}
                  </div>
                  {m.supporting_facts && m.supporting_facts.length > 0 && (
                    <div className="ai-chat-facts">
                      {m.supporting_facts.map((fact, idx) => (
                        <span key={idx} className="ai-chat-fact-pill">
                          ✓ {fact}
                        </span>
                      ))}
                    </div>
                  )}
                  <span style={{ fontSize: 10, color: '#91a39b', marginTop: 3, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.timestamp}
                  </span>
                </div>
              ))}

              {isChatSubmitting && (
                <div className="ai-chat-msg assistant">
                  <div className="ai-bubble ai-bubble-assistant">
                    <span style={{ fontStyle: 'italic', color: '#557266' }}>Gemini is thinking...</span>
                  </div>
                </div>
              )}
            </div>

            {chatError && (
              <div style={{ color: '#b91c1c', fontSize: 12, background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>
                {chatError}
              </div>
            )}

            {/* Suggested Prompt Chips */}
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#718078', fontWeight: 600 }}>Suggested Questions:</p>
              <div className="ai-chips-strip">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="ai-prompt-chip"
                    onClick={() => handleSendChat(prompt)}
                    disabled={isChatSubmitting}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Input Bar */}
            <form
              className="ai-chat-input-bar"
              onSubmit={(e) => {
                e.preventDefault()
                handleSendChat()
              }}
            >
              <input
                type="text"
                placeholder="Ask about storage, expiry, recipes, or stock..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                maxLength={1000}
                disabled={isChatSubmitting}
                aria-label="Pantry assistant question"
              />
              <button
                type="submit"
                className="primary-button"
                disabled={isChatSubmitting || !inputMessage.trim()}
              >
                Send
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
