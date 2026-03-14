import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';
import { callOCIToolViaMCP } from '../mcp/service';
import { OCI_TOOLS, OCI_SYSTEM_PROMPT } from './tools';
import logger from '../utils/logger';

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Write-tool detection ─────────────────────────────────────────────────────
// Any tool whose name contains a mutating verb requires user confirmation.

const WRITE_VERBS = [
  'create', 'delete', 'terminate', 'enable', 'disable',
  'update', 'modify', 'attach', 'detach',
];

function isWriteTool(name: string): boolean {
  const lower = name.toLowerCase();
  return WRITE_VERBS.some(v => lower.includes(v));
}

// ─── PendingTool ──────────────────────────────────────────────────────────────
// Serialised into the 'done' event when the agentic loop pauses before a write
// operation.  The client stores it and sends it back on the next request so the
// server can resume exactly where it left off.

export interface PendingTool {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Tool results already collected from read tools executed in the same turn,
   *  before the first write tool was encountered.  Empty in the common case. */
  readResults: Anthropic.ToolResultBlockParam[];
}

// ─── Chat handler ─────────────────────────────────────────────────────────────
// Streams a multi-turn agentic conversation over SSE.
//
// Normal flow:
//   Each turn calls Claude, streams text deltas, executes any read-only tool
//   calls immediately, and loops until end_turn.
//
// Write-tool flow:
//   When a mutating tool is about to be called the handler pauses:
//     1. Emits  confirmation_required  (UI shows a Confirm / Cancel card)
//     2. Emits  done  with a pendingTool payload
//     3. Returns — the browser reopens the stream once the user decides.
//   On resume (pendingTool present in the POST body):
//     __CONFIRM__ → executes all paused tools, continues the agentic loop
//     __CANCEL__  → injects "cancelled" tool results, Claude acknowledges

export async function handleChat(
  userMessage: string,
  history: Anthropic.MessageParam[],
  res: Response,
  pendingTool?: PendingTool,
): Promise<void> {
  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // ── Build conversation ─────────────────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [...history];

  if (pendingTool) {
    // Resume after a confirmation pause.
    // history already ends with the assistant's tool_use message (pushed before we
    // sent confirmation_required).  We must now supply tool_result(s) for it.
    const priorResults = pendingTool.readResults ?? [];

    // Helper: collect any tool_use blocks from the last assistant message that
    // are not yet accounted for by priorResults or pendingTool itself.
    const lastAssistant = messages[messages.length - 1];
    const getUnaccounted = (accounted: Set<string>): Anthropic.ToolResultBlockParam[] => {
      if (!lastAssistant || lastAssistant.role !== 'assistant' || !Array.isArray(lastAssistant.content)) {
        return [];
      }
      return (lastAssistant.content as Anthropic.ContentBlock[])
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && !accounted.has(b.id))
        .map(b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: 'Skipped: a preceding tool in this batch was cancelled.',
        }));
    };

    if (userMessage === '__CONFIRM__') {
      // Execute the write tool that was pending.
      sse(res, 'tool_call', { id: pendingTool.id, name: pendingTool.name, input: pendingTool.input });

      const allResults: Anthropic.ToolResultBlockParam[] = [...priorResults];
      try {
        const result = await callOCIToolViaMCP(pendingTool.name, pendingTool.input);
        sse(res, 'tool_result', { id: pendingTool.id, name: pendingTool.name, result });
        allResults.push({
          type: 'tool_result',
          tool_use_id: pendingTool.id,
          content: JSON.stringify(result, null, 2),
        });
      } catch (toolError) {
        const errMsg = (toolError as Error).message;
        logger.error(`Tool execution failed: ${pendingTool.name}`, { error: toolError });
        sse(res, 'tool_error', { id: pendingTool.id, name: pendingTool.name, error: errMsg });
        allResults.push({
          type: 'tool_result',
          tool_use_id: pendingTool.id,
          content: `Error: ${errMsg}`,
          is_error: true,
        });
      }

      // Provide skipped results for any remaining unaccounted tool_use blocks.
      const accounted = new Set([
        ...priorResults.map(r => r.tool_use_id),
        pendingTool.id,
      ]);
      allResults.push(...getUnaccounted(accounted));

      messages.push({ role: 'user', content: allResults });

    } else if (userMessage === '__CANCEL__') {
      const allResults: Anthropic.ToolResultBlockParam[] = [
        ...priorResults,
        {
          type: 'tool_result',
          tool_use_id: pendingTool.id,
          content: 'The user cancelled this operation.',
        },
      ];

      // Also cancel any remaining unaccounted tool_use blocks in the batch.
      const accounted = new Set([
        ...priorResults.map(r => r.tool_use_id),
        pendingTool.id,
      ]);
      allResults.push(...getUnaccounted(accounted));

      messages.push({ role: 'user', content: allResults });
    }
    // Fall through to the agentic loop — Claude responds to the tool result(s).

  } else {
    // Normal first message from the user.
    messages.push({ role: 'user', content: userMessage });
  }

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

      stream.on('text', (delta) => sse(res, 'text', { delta }));

      const message = await stream.finalMessage();

      // ── End of natural response ───────────────────────────────────────────
      if (message.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: message.content });

        const fullText = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        sse(res, 'done', { text: fullText, history: messages.slice(-30) });
        break;
      }

      // ── Tool use ──────────────────────────────────────────────────────────
      if (message.stop_reason === 'tool_use') {
        // Push the full assistant content (text + all tool_use blocks) to history
        // so any confirmation resume can reference it.
        messages.push({ role: 'assistant', content: message.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of message.content) {
          if (block.type !== 'tool_use') continue;

          // ── Write tool: pause for user confirmation ──────────────────────
          if (isWriteTool(block.name)) {
            sse(res, 'confirmation_required', {
              id: block.id,
              name: block.name,
              input: block.input,
            });
            sse(res, 'done', {
              text: '',
              history: messages.slice(-30),
              pendingTool: {
                id: block.id,
                name: block.name,
                input: block.input as Record<string, unknown>,
                // Carry forward any read-tool results already collected this turn.
                readResults: toolResults,
              } satisfies PendingTool,
            });
            return; // finally block calls res.end()
          }

          // ── Read tool: execute immediately ───────────────────────────────
          sse(res, 'tool_call', { id: block.id, name: block.name, input: block.input });

          try {
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
