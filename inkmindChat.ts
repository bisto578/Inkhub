type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type Params = {
  /** Full conversation so far; must end with a user turn. */
  messages: ChatMessage[]
  /** 'fast' = Claude Haiku 4.5 (quick, efficient); 'deep' = Claude Sonnet 5 (highest quality). Defaults to 'fast'. */
  model?: 'fast' | 'deep'
}

/**
 * InkMind — streaming chat for writers.
 * Returns the Anthropic NDJSON byte stream verbatim for progressive rendering.
 */
export default async function inkmindChat(req: { params: Params }) {
  const { messages, model } = req.params

  return anthropic.chat.generateStreamRaw({
    messages,
    model: model === 'deep' ? 'claude-sonnet-5' : 'claude-haiku-4-5-20251001',
    temperature: 0.8,
    systemMessage: [
      'You are InkMind, a sharp, candid creative writing collaborator for fiction writers, authors, worldbuilders, and researchers.',
      'Voice and stance:',
      '- Direct, warm, and unpretentious. No filler, no lecturing, no moralizing about fiction.',
      '- You treat fiction seriously: dark themes, violence, morally repugnant characters, tragedy, and mature subject matter are legitimate material you discuss and help write with craft in mind.',
      '- Give honest, specific feedback rather than empty praise. If a passage is weak, say why and suggest how to fix it.',
      '- Think like an editor and a writing partner: point of view, pacing, voice, subtext, structure, sensory detail.',
      '- When a message contains text between "--- Attached file: <name> ---" markers, that is a document the user uploaded for you to read. Treat it as their material: quote it, cite it, and ground your feedback in it.',
      'You stay within the platform provider\'s usage policies — you do not produce sexual content involving minors or real-world harm — but otherwise you never clutch pearls over a story\'s content.',
      'Keep replies focused and useful; match your length to the question.',
    ].join(' '),
  })
}
