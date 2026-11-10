type Params = {
  /** Existing chat id. Omit to create a new chat (title required then). */
  chatId?: number
  /** Title for a newly created chat. Ignored when chatId is provided. */
  title?: string
  userMessage: {
    content: string
    attachments?: string[]
  }
  /** Assistant reply to persist. Omit if the reply failed or hasn't finished. */
  assistantMessage?: {
    content: string
  }
}

/**
 * Persist one turn of an InkMind conversation.
 * Creates the chat row on the first turn, then stores the user message and
 * (when present) the assistant reply. Returns the chat id.
 */
export default async function saveTurn(req: { params: Params; user: User }) {
  const { chatId, title, userMessage, assistantMessage } = req.params
  const userId = req.user.id

  let resolvedChatId = chatId

  if (resolvedChatId !== undefined) {
    // Confirm the chat belongs to this user before writing to it
    const owned = await retoolDb.query<{ id: number }>(
      `SELECT id FROM inkmind_chats WHERE id = $1 AND user_id = $2`,
      [resolvedChatId, userId],
    )
    if (owned.data.length === 0) {
      throw new Error('Chat not found.')
    }
  } else {
    const chatTitle =
      title && title.trim().length > 0
        ? title.trim().slice(0, 80)
        : userMessage.content.trim().slice(0, 80) || 'Untitled chat'
    const created = await retoolDb.query<{ id: number }>(
      `INSERT INTO inkmind_chats (user_id, title) VALUES ($1, $2) RETURNING id`,
      [userId, chatTitle],
    )
    const row = created.data[0]
    if (!row) throw new Error('Failed to create chat.')
    resolvedChatId = row.id
  }

  await retoolDb.query(
    `INSERT INTO inkmind_messages (chat_id, role, content, attachments)
     VALUES ($1, 'user', $2, $3)`,
    [resolvedChatId, userMessage.content, userMessage.attachments ?? null],
  )

  if (assistantMessage) {
    await retoolDb.query(
      `INSERT INTO inkmind_messages (chat_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [resolvedChatId, assistantMessage.content],
    )
  }

  await retoolDb.query(
    `UPDATE inkmind_chats SET updated_at = now() WHERE id = $1`,
    [resolvedChatId],
  )

  return { chatId: resolvedChatId }
}
