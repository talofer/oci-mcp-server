import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { callOCIToolViaMCP } from '../mcp/service';
import { OCI_TOOLS, OCI_SYSTEM_PROMPT } from './tools';
import logger from '../utils/logger';

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Chat handler ─────────────────────────────────────────────────────────────
// Streams a multi-turn agentic conversation over SSE.
// Each turn:
//   1. Calls Claude (claude-opus-4-6) with the full OCI tool set
//   2. Streams text deltas to the client as they arrive
//   3. On tool_use: calls the OCI MCP tool, streams progress events, loops
//   4. On end_turn: sends 'done' and closes the SSE stream

export async function handleChat(
  userMessage: string,
  history: Anthropic.MessageParam[],
  res: Response,
): Promise<void> {
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build conversation — append new user message
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const MAX_TURNS = 20;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // ── Stream this turn ──────────────────────────────────────────────────
      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: OCI_SYSTEM_PROMPT,
        tools: OCI_TOOLS,
        messages,
      });

      // Forward text deltas to the browser as they arrive
      stream.on('text', (delta) => sse(res, 'text', { delta }));

      const message = await stream.finalMessage();

      // ── End of natural response ───────────────────────────────────────────
      if (message.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: message.content });

        const fullText = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        sse(res, 'done', {
          text: fullText,
          // Return trimmed history (last 30 turns) so the browser can send it back next time
          history: messages.slice(-30),
        });
        break;
      }

      // ── Tool use ──────────────────────────────────────────────────────────
      if (message.stop_reason === 'tool_use') {
        // Keep thinking + text + tool_use blocks in history
        messages.push({ role: 'assistant', content: message.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of message.content) {
          if (block.type !== 'tool_use') continue;

          sse(res, 'tool_call', { id: block.id, name: block.name, input: block.input });

          try {
            // ▶ Call the OCI tool via the MCP in-process client
            const result = await callOCIToolViaMCP(
              block.name,
              block.input as Record<string, unknown>,
            );

            sse(res, 'tool_result', { id: block.id, name: block.name, result });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result, null, 2),
            });
          } catch (toolError) {
            const errMsg = (toolError as Error).message;
            logger.error(`Tool execution failed: ${block.name}`, { error: toolError });

            sse(res, 'tool_error', { id: block.id, name: block.name, error: errMsg });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${errMsg}`,
              is_error: true,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // ── pause_turn: server-side loop limit; re-send to continue ──────────
      if ((message.stop_reason as string) === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }

      // Unknown stop reason — break to avoid infinite loop
      break;
    }
  } catch (error) {
    logger.error('Chat handler error', { error });

    let msg = 'An unexpected error occurred.';
    if (error instanceof Anthropic.AuthenticationError) {
      msg = 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your environment.';
    } else if (error instanceof Anthropic.RateLimitError) {
      msg = 'Rate limit reached. Please wait a moment and try again.';
    } else if (error instanceof Anthropic.APIError) {
      msg = `Claude API error (HTTP ${error.status}): ${error.message}`;
    } else if (error instanceof Error) {
      msg = error.message;
    }

    sse(res, 'error', { message: msg });
  } finally {
    res.end();
  }
}
