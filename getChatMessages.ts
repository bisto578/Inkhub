type Params = {
  chatId: number
}

/**
 * Fetch all messages of one saved chat, oldest first.
 * Ownership enforced: the chat must belong to the current user.
 */
export default async function getChatMessages(req: { params: Params; user: User }) {
  const result = await retoolDb.query<{
    role: 'user' | 'assistant'
    content: string
    attachments: string[] | null
  }>(
    `SELECT m.role, m.content, m.attachments
     FROM inkmind_messages m
     JOIN inkmind_chats c ON c.id = m.chat_id
     WHERE m.chat_id = $1 AND c.user_id = $2
     ORDER BY m.id`,
    [req.params.chatId, req.user.id],
  )
  return result.data
}
