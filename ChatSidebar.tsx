import { MessageSquare, Plus, Trash2, History, Loader2 } from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import { cn } from '../lib/shadcn/utils'
import { formatRelativeTime } from '../utils/formatRelativeTime'

export type ChatSummary = {
  id: number
  title: string
  created_at: string
  updated_at: string
}

type Props = {
  chats: ChatSummary[] | null
  activeChatId: number | null
  loading: boolean
  loadingChat: boolean
  busy: boolean
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onNew: () => void
}

export default function ChatSidebar({
  chats,
  activeChatId,
  loading,
  loadingChat,
  busy,
  onSelect,
  onDelete,
  onNew,
}: Props) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <History className="h-4 w-4" />
          Past chats
        </div>
        <Button variant="outline" size="sm" onClick={onNew} disabled={busy} aria-label="Start a new chat">
          <Plus className="mr-1.5 h-4 w-4" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !chats || chats.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No saved chats yet. Conversations are saved automatically as you send messages.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId
              return (
                <li key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 pr-8 text-left transition-colors',
                      isActive
                        ? 'border-primary/40 bg-accent'
                        : 'border-transparent hover:bg-accent/60',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <MessageSquare
                        className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}
                      />
                      <span className="truncate">{chat.title}</span>
                    </span>
                    <span className="pl-[22px] text-xs text-muted-foreground">
                      {loadingChat && isActive ? 'Loading…' : formatRelativeTime(chat.updated_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete chat: ${chat.title}`}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(chat.id)
                    }}
                    className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
