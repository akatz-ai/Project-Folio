'use client'

import { useState, useRef, useEffect } from 'react'
import { ProjectWithRelations } from '@/types/database'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatSidebarProps {
  projects: ProjectWithRelations[]
  onProjectsUpdate: (projects: ProjectWithRelations[]) => void
}

export function AIChatSidebar({ projects, onProjectsUpdate }: AIChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!loading && isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [loading, isOpen])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, projects, history: messages }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      onProjectsUpdate(data.projects)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = [
    'Add a new project called...',
    'Add a note to [project]...',
    'Add a bug to [project]...',
    'Summarize my projects',
  ]

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 w-14 h-14 rounded-full bg-accent-primary text-white shadow-lg hover:bg-accent-primary-hover transition-colors flex items-center justify-center z-40"
        title="AI Assistant"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-96 max-w-full bg-bg-primary border-l border-border shadow-lg z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
          <h3 className="font-display text-lg font-medium">AI Assistant</h3>
          <button onClick={() => setIsOpen(false)} className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 h-[calc(100%-160px)] sm:h-[calc(100%-140px)]">
          {messages.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              <p className="mb-4 text-sm">How can I help you manage your projects?</p>
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="block w-full text-left text-xs px-3 py-2 bg-bg-secondary rounded border border-border-light hover:border-accent-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-accent-primary text-white'
                        : 'bg-bg-secondary border border-border-light'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-bg-secondary border border-border-light px-4 py-2 rounded-lg">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                      <span className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 sm:pb-4 border-t border-border-light bg-bg-primary">
          <form
            onSubmit={e => {
              e.preventDefault()
              sendMessage()
            }}
            className="flex gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Ask anything..."
              className="form-input flex-1 resize-none min-h-[38px] max-h-[120px]"
              disabled={loading}
              rows={1}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn btn-primary px-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
