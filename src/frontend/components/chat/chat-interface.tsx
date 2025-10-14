import type React from "react"
import { useEffect, useState, useRef } from "react"
import { elizaClient } from '@/lib/elizaClient'
import { socketManager } from '@/lib/socketManager'
import type { UUID, Agent } from '@elizaos/core'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Bot, Loader2 } from "lucide-react"
import { Bullet } from "@/components/ui/bullet"
import { cn } from "@/lib/utils"
import ArrowRightIcon from "@/components/icons/arrow-right"

// Quick start prompts for new conversations
const QUICK_PROMPTS = [
  {
    label: "Market Analysis",
    message: "What's the current DeFi market situation?"
  },
  {
    label: "Portfolio Review",
    message: "Analyze my portfolio and suggest optimizations"
  },
  {
    label: "Risk Assessment",
    message: "Should I invest in this new DeFi protocol? It's promising 300% APY."
  },
  {
    label: "Stablecoins",
    message: "Explain stablecoin peg dynamics"
  }
]

interface Message {
  id: string
  content: string
  authorId: string
  createdAt: number
  isAgent: boolean
  senderName?: string
}

interface ChatInterfaceProps {
  agent: Agent
  userId: string
  serverId: string
  channelId: string
}

export function ChatInterface({ agent, userId, serverId, channelId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load messages when channel changes
  useEffect(() => {
    if (!channelId) return

    async function loadMessages() {
      try {
        console.log('📨 Loading messages for channel:', channelId)
        const messagesResponse = await elizaClient.messaging.getChannelMessages(channelId as UUID, {
          limit: 50,
        })

        const formattedMessages: Message[] = messagesResponse.messages.map((msg) => {
          let timestamp: number
          if (msg.createdAt instanceof Date) {
            timestamp = msg.createdAt.getTime()
          } else if (typeof msg.createdAt === 'number') {
            timestamp = msg.createdAt
          } else if (typeof msg.createdAt === 'string') {
            timestamp = Date.parse(msg.createdAt)
          } else {
            timestamp = Date.now()
          }

          return {
            id: msg.id,
            content: msg.content,
            authorId: msg.authorId,
            createdAt: timestamp,
            isAgent: msg.authorId === agent.id,
            senderName: msg.metadata?.authorDisplayName || (msg.authorId === agent.id ? agent.name : 'User'),
          }
        })

        const sortedMessages = formattedMessages.sort((a, b) => a.createdAt - b.createdAt)
        setMessages(sortedMessages)
        console.log(`✅ Loaded ${sortedMessages.length} messages`)
      } catch (error: any) {
        console.error('❌ Failed to load messages:', error)
      }
    }

    loadMessages()
  }, [channelId, agent.id, agent.name])

  // Listen for new messages (channel joining is handled in App.tsx)
  useEffect(() => {
    if (!channelId) return undefined

    const handleNewMessage = (data: any) => {
      console.log('📩 New message received:', data)
      
      const messageId = data.id || crypto.randomUUID()
      const newMessage: Message = {
        id: messageId,
        content: data.content || data.text || data.message || '',
        authorId: data.senderId,
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.parse(data.createdAt as string),
        isAgent: data.senderId === agent.id,
        senderName: data.senderName || (data.senderId === agent.id ? agent.name : 'User'),
      }

      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === messageId)) {
          return prev
        }
        // Add new message and sort by timestamp
        const updated = [...prev, newMessage]
        return updated.sort((a, b) => a.createdAt - b.createdAt)
      })
      
      // Stop typing indicator when agent responds
      if (newMessage.isAgent) {
        setIsTyping(false)
      }
    }

    // Only subscribe if socket is available - prevents errors during reconnection
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = socketManager.onMessage(handleNewMessage)
    } catch (error) {
      console.warn('⚠️ Failed to subscribe to messages (socket not ready):', error)
      return undefined
    }

    return () => {
      unsubscribe?.()
    }
  }, [channelId, agent.id, agent.name, userId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    
    console.log('🚀 [ChatInterface] Sending message:', {
      channelId,
      text: inputValue,
      serverId,
      userId,
      agentId: agent.id,
    })
    
    // Send via socket (don't add optimistically - server will broadcast back)
    socketManager.sendMessage(channelId, inputValue, serverId, {
      userId,
      isDm: true,
      targetUserId: agent.id,
    })
    
    setInputValue('')
    setIsTyping(true)
  }

  // Handle quick prompt click - auto send message
  const handleQuickPrompt = (message: string) => {
    if (isTyping || !message.trim()) return
    
    console.log('🚀 [ChatInterface] Sending quick prompt:', {
      channelId,
      text: message,
      serverId,
      userId,
      agentId: agent.id,
    })
    
    // Send via socket directly
    socketManager.sendMessage(channelId, message, serverId, {
      userId,
      isDm: true,
      targetUserId: agent.id,
    })
    
    setIsTyping(true)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] gap-6">
      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full overflow-y-auto p-6">
          <div className="space-y-4 h-full flex flex-col">
            {/* Messages */}
            <div className="flex-1 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex flex-col gap-1", message.isAgent ? "items-start" : "items-end")}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm font-medium",
                      message.isAgent ? "bg-accent text-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <span className="text-xs opacity-50 mt-1 block">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex flex-col gap-1 items-start">
                  <div className="max-w-[70%] rounded-lg px-3 py-2 bg-accent text-foreground">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts - Only show when no messages */}
            {messages.length === 0 && (
              <div className="pt-4 border-t border-border">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-mono">Quick Start</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      onClick={() => handleQuickPrompt(prompt.message)}
                      disabled={isTyping}
                      className="px-3 py-2 text-xs sm:text-sm bg-accent hover:bg-accent/80 text-foreground rounded border border-border transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="border-t-2 border-muted bg-secondary h-12 p-1 relative">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          disabled={isTyping}
          className="flex-1 rounded-none border-none text-foreground placeholder-foreground/40 text-sm font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
        />
        <Button
          variant={inputValue.trim() ? "default" : "outline"}
          onClick={handleSubmit}
          disabled={!inputValue.trim() || isTyping}
          className="absolute right-1.5 top-1.5 h-8 w-12 p-0"
        >
          {isTyping ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowRightIcon className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
