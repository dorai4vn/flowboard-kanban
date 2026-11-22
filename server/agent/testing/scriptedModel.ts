import { Usage, type AgentInputItem, type AgentOutputItem, type Model, type ModelRequest, type ModelResponse } from '@openai/agents';

/**
 * Deterministic stand-in for the LLM, for automated tests ONLY. It speaks the SDK's Model protocol, so the
 * real Runner, tools, approvals and run-state code are exercised; only the model's decisions are scripted.
 * Never treat results produced with it as evidence that the real model works.
 */
export type Step = (input: AgentInputItem[]) => AgentOutputItem[] | Promise<AgentOutputItem[]>;

let callSeq = 0;
export const call = (name: string, args: Record<string, unknown>): AgentOutputItem => ({
  type: 'function_call',
  callId: `call_${++callSeq}`,
  name,
  arguments: JSON.stringify(args),
  status: 'completed',
});
export const say = (text: string): AgentOutputItem => ({
  type: 'message',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text }],
});

/** Text of the most recent tool result in the conversation, parsed as JSON when possible. */
export function lastToolResult(input: AgentInputItem[]): { name: string; value: unknown } | null {
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i] as { type?: string; name?: string; output?: unknown };
    if (item.type !== 'function_call_result') continue;
    const out = item.output as { text?: string } | string | { type: string; text?: string }[] | undefined;
    const text = typeof out === 'string' ? out : Array.isArray(out) ? out.map((o) => o.text ?? '').join('') : (out?.text ?? '');
    try {
      return { name: item.name ?? '', value: JSON.parse(text) };
    } catch {
      return { name: item.name ?? '', value: text };
    }
  }
  return null;
}

export function lastUserText(input: AgentInputItem[]): string {
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i] as { role?: string; content?: unknown };
    if (item.role !== 'user') continue;
    if (typeof item.content === 'string') return item.content;
    if (Array.isArray(item.content)) return item.content.map((c: { text?: string }) => c.text ?? '').join('');
  }
  return '';
}

export class ScriptedModel implements Model {
  readonly requests: ModelRequest[] = [];
  private i = 0;
  constructor(private readonly steps: Step[] | ((input: AgentInputItem[]) => AgentOutputItem[] | Promise<AgentOutputItem[]>)) {}

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const input = (typeof request.input === 'string' ? [{ role: 'user', content: request.input }] : request.input) as AgentInputItem[];
    const step = Array.isArray(this.steps) ? this.steps[this.i++] : this.steps;
    if (!step) throw new Error('ScriptedModel: no more steps');
    const output = await step(input);
    return { usage: new Usage(), output };
  }

  // eslint-disable-next-line require-yield
  async *getStreamedResponse(): AsyncIterable<never> {
    throw new Error('ScriptedModel does not stream');
  }
}
