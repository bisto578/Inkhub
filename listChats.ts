/**
 * List the current user's saved InkMind chats, most recent first.
 */
export default async function listChats(req: { user: User }) {
  const result = await retoolDb.query<{
    id: number
    title: string
    created_at: string
    updated_at: string
  }>(
    `SELECT id, title, created_at, updated_at
     FROM inkmind_chats
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 100`,
    [req.user.id],
  )
  return result.data
}
