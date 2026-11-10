type Params = {
  chatId: number
}

/**
 * Delete one of the current user's saved chats (messages cascade).
 */
export default async function deleteChat(req: { params: Params; user: User }) {
  const result = await retoolDb.query<{ id: number }>(
    `DELETE FROM inkmind_chats WHERE id = $1 AND user_id = $2 RETURNING id`,
    [req.params.chatId, req.user.id],
  )
  if (result.data.length === 0) {
    throw new Error('Chat not found.')
  }
  return { deleted: true }
}
