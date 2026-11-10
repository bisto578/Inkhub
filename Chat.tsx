import { useEffect, useRef, useState } from 'react'
import {
  Feather, SendHorizonal, RotateCcw, AlertCircle, Paperclip, FileText, Loader2, Zap, Brain, PanelLeft,
} from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import { Textarea } from '../lib/shadcn/textarea'
import { cn } from '../lib/shadcn/utils'
import { extractFileText, isSupportedFile } from '../utils/extractFileText'
import { useInkmindChat, useListChats, useGetChatMessages, useSaveTurn, useDeleteChat } from '../hooks/backend/chat'
import ChatSidebar from '../components/ChatSidebar'
import type { ChatSummary } from '../components/ChatSidebar'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** File names attached to this user message (display only; text is embedded in content). */
  attachments?: string[]
}

type ModelMode = 'fast' | 'deep'

type StreamChunk =
  | { data: string }
  | { metadata: Record<string, unknown> }

const SUGGESTIONS = [
  'Critique the opening paragraph of my draft',
  'Help me build a morally gray antagonist',
  'Brainstorm worldbuilding for a drowned city',
  'Sharpen this dialogue scene',
]

function AttachmentChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`Remove ${name}`}
        >
          <span aria-hidden className="text-sm leading-none">&times;</span>
        </button>
      )}
    </span>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-3 w-full', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Feather className="h-4 w-4" />
        </div>
      )}
      <div className={cn('flex max-w-[80%] flex-col gap-2', isUser && 'items-end')}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((name) => (
              <AttachmentChip key={name} name={name} />
            ))}
          </div>
        )}
        <div
          className={cn(
            'rounded-lg px-4 py-3 whitespace-pre-wrap break-words text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground border border-border',
          )}
        >
          {message.content}
        </div>
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground">
          You
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [readingFiles, setReadingFiles] = useState(false)
  const [modelMode, setModelMode] = useState<ModelMode>('fast')
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { trigger: sendToInkmind } = useInkmindChat()
  const { data: chats, loading: chatsLoading, trigger: refreshChats } = useListChats()
  const { trigger: triggerLoadMessages } = useGetChatMessages()
  const { trigger: triggerSaveTurn } = useSaveTurn()
  const { trigger: triggerDeleteChat } = useDeleteChat()

  // Load the chat list on mount
  useEffect(() => {
    refreshChats()
  }, [refreshChats])

  // Auto-scroll as messages or streamed tokens arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  function pickFiles(fileList: FileList | null) {
    if (!fileList) return
    const accepted: File[] = []
    const rejected: string[] = []
    Array.from(fileList).forEach((file) => {
      if (isSupportedFile(file.name)) accepted.push(file)
      else rejected.push(file.name)
    })
    setPendingFiles((prev) => [...prev, ...accepted])
    if (rejected.length > 0) {
      setError(`Unsupported file type: ${rejected.join(', ')}. Supported: txt, md, pdf, docx, csv, json, and other text formats.`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** Persist one turn to the database. Tolerant of a missing assistant reply. */
  async function persistTurn(
    userContent: string,
    fileNames: string[],
    assistantContent: string | null,
    title: string | null,
  ) {
    const turnParams: Record<string, unknown> = {
      userMessage: {
        content: userContent,
        ...(fileNames.length > 0 ? { attachments: fileNames } : {}),
      },
      ...(assistantContent ? { assistantMessage: { content: assistantContent } } : {}),
      ...(activeChatId !== null ? { chatId: activeChatId } : title ? { title } : {}),
    }
    try {
      const handle = triggerSaveTurn(turnParams)
      const saved = (await handle.result) as { chatId: number }
      setActiveChatId(saved.chatId)
    } catch {
      // Persistence failure shouldn't break the conversation; surface it quietly
      setError('Chat may not have been saved (storage error), but your conversation continues.')
    }
    refreshChats(undefined, { skipCache: true })
  }

  async function send(text: string, files: File[]) {
    const trimmed = text.trim()
    if ((!trimmed && files.length === 0) || busy) return

    setError(null)
    setBusy(true)
    setStreamingText('')

    // Extract text from attachments before building the user turn
    let extracted: { name: string; text: string }[] = []
    if (files.length > 0) {
      setReadingFiles(true)
      try {
        extracted = await Promise.all(
          files.map(async (file) => ({ name: file.name, text: await extractFileText(file) })),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the attached file.')
        setBusy(false)
        setReadingFiles(false)
        return
      }
      setReadingFiles(false)
    }

    const attachmentBlocks = extracted.map(
      (f) => `--- Attached file: ${f.name} ---\n${f.text}`,
    )
    const prompt = trimmed || 'Read the attached file(s) and give me your honest take.'
    const content = [...attachmentBlocks, prompt].join('\n\n')
    const fileNames = files.map((f) => f.name)

    const userTurn: ChatMessage = files.length > 0
      ? { role: 'user', content, attachments: fileNames }
      : { role: 'user', content }
    const history: ChatMessage[] = [...messages, userTurn]
    setMessages(history)
    setInput('')
    setPendingFiles([])

    let finalText: string | null = null
    try {
      const handle = sendToInkmind({ messages: history, model: modelMode })
      // Progressive rendering: append each token chunk as it arrives
      if (handle.stream) {
        for await (const chunk of handle.stream as AsyncIterable<StreamChunk>) {
          if (chunk && typeof chunk === 'object' && 'data' in chunk && typeof chunk.data === 'string') {
            setStreamingText((prev) => prev + chunk.data)
          }
        }
      }
      // Always consume .result — it is the authoritative output
      const chunks = (await handle.result) as StreamChunk[]
      const joined = chunks
        .map((c) => ('data' in c && typeof c.data === 'string' ? c.data : ''))
        .join('')
      finalText = joined.length > 0 ? joined : null
      setStreamingText('')
      setMessages((prev) => [...prev, { role: 'assistant', content: joined }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
      await persistTurn(content, fileNames, finalText, trimmed || fileNames[0] || null)
    }
  }

  async function selectChat(id: number) {
    if (busy || id === activeChatId) return
    setActiveChatId(id)
    setLoadingChat(true)
    setError(null)
    setStreamingText('')
    try {
      const handle = triggerLoadMessages({ chatId: id })
      const rows = (await handle.result) as Array<{
        role: 'user' | 'assistant'
        content: string
        attachments: string[] | null
      }>
      setMessages(
        rows.map((r) =>
          r.attachments && r.attachments.length > 0
            ? { role: r.role, content: r.content, attachments: r.attachments }
            : { role: r.role, content: r.content },
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that chat.')
    } finally {
      setLoadingChat(false)
    }
  }

  async function removeChat(id: number) {
    if (busy) return
    try {
      await triggerDeleteChat({ chatId: id }).result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that chat.')
      return
    }
    if (id === activeChatId) resetChat()
    refreshChats(undefined, { skipCache: true })
  }

  function resetChat() {
    if (busy) return
    setMessages([])
    setStreamingText('')
    setError(null)
    setPendingFiles([])
    setActiveChatId(null)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <div className={cn('absolute inset-y-0 left-0 z-40 md:relative md:z-auto', !sidebarOpen && 'hidden')}>
        <ChatSidebar
          chats={chats as ChatSummary[] | null}
          activeChatId={activeChatId}
          loading={chatsLoading}
          loadingChat={loadingChat}
          busy={busy}
          onSelect={selectChat}
          onDelete={removeChat}
          onNew={resetChat}
        />
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label={sidebarOpen ? 'Hide chat history' : 'Show chat history'}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Feather className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">InkMind</h1>
              <p className="text-xs text-muted-foreground">Creative writing collaborator</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetChat} disabled={busy || (messages.length === 0 && activeChatId === null)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            New chat
          </Button>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
            {messages.length === 0 && !streamingText ? (
              <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Feather className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">What are we writing today?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Drafts, critique, characters, worlds — bring it. Attach a file and I'll read it.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s, [])}
                      className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => <MessageBubble key={i} message={m} />)
            )}
            {streamingText && <MessageBubble message={{ role: 'assistant', content: streamingText }} />}
            {busy && !streamingText && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {readingFiles ? <FileText className="h-4 w-4" /> : <Feather className="h-4 w-4" />}
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {readingFiles ? 'Reading your file…' : 'Thinking…'}
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {/* Composer */}
        <div
          className="border-t border-border bg-background px-4 pb-4 pt-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            pickFiles(e.dataTransfer.files)
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((file) => (
                  <AttachmentChip
                    key={file.name + file.size}
                    name={file.name}
                    onRemove={() => setPendingFiles((prev) => prev.filter((f) => f !== file))}
                  />
                ))}
              </div>
            )}
            <form
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                send(input, pendingFiles)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".txt,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm,.yaml,.yml,.log,.rtf,.tex,.srt,.vtt,.ini,.toml,.pdf,.docx"
                onChange={(e) => pickFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Attach files"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="group" aria-label="Model speed">
                <button
                  type="button"
                  onClick={() => setModelMode('fast')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    modelMode === 'fast'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  title="Claude Haiku 4.5 — quick and efficient"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Fast
                </button>
                <button
                  type="button"
                  onClick={() => setModelMode('deep')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    modelMode === 'deep'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  title="Claude Sonnet 5 — deepest quality"
                >
                  <Brain className="h-3.5 w-3.5" />
                  Deep
                </button>
              </div>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input, pendingFiles)
                  }
                }}
                placeholder="Write to InkMind… (Enter to send, Shift+Enter for a new line, drop or attach a file to have it read)"
                rows={1}
                className="max-h-48 min-h-[44px] flex-1 resize-none"
                disabled={busy}
              />
              <Button type="submit" size="icon" disabled={busy || (!input.trim() && pendingFiles.length === 0)} aria-label="Send message">
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
