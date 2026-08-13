export interface ContextMessage { role: 'user' | 'assistant'; content: string; }
export interface ContextResult {
  summary: string;
  recentMessages: ContextMessage[];
  stateSnapshot: Record<string, unknown>;
  currentInput: string;
}
export interface SessionContextOptions {
  contextWindow?: number;
  reserveTokens?: number;
  keepRecentTokens?: number;
  countTokens?: (text: string) => number;
}

export class SessionContextManager {
  readonly reserveTokens: number;
  readonly keepRecentTokens: number;
  readonly contextWindow: number;
  private readonly countTokens: (text: string) => number;
  private messages: ContextMessage[] = [];
  private summary = '';

  constructor(options: SessionContextOptions = {}) {
    this.contextWindow = options.contextWindow ?? 1_000_000;
    this.reserveTokens = options.reserveTokens ?? 16_384;
    this.keepRecentTokens = options.keepRecentTokens ?? 20_000;
    this.countTokens = options.countTokens ?? ((text) => Math.ceil(text.length / 4));
  }

  addMessage(message: ContextMessage): void { this.messages.push(message); }

  buildContext(stateSnapshot: Record<string, unknown>, currentInput: string, persistedSummary = ''): ContextResult {
    const totalHistoryBudget = Math.max(0, this.contextWindow - this.reserveTokens - this.countTokens(currentInput) - this.countTokens(JSON.stringify(stateSnapshot)));
    const summaryBudget = Math.max(0, Math.min(this.keepRecentTokens, Math.floor(totalHistoryBudget / 2)));
    this.summary = this.truncate(persistedSummary, summaryBudget);
    const availableTokens = Math.max(0, Math.min(this.keepRecentTokens, this.contextWindow - this.reserveTokens - this.countTokens(currentInput) - this.countTokens(JSON.stringify(stateSnapshot)) - this.countTokens(this.summary)));
    let recentTokens = 0;
    let splitAt = this.messages.length;
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const tokens = this.countTokens(this.messages[index].content);
      if (recentTokens + tokens > availableTokens) break;
      recentTokens += tokens;
      splitAt = index;
    }
    const compacted = this.messages.slice(0, splitAt);
    if (compacted.length) {
      const addition = compacted.map((message) => `${message.role}: ${message.content}`).join('\n');
      this.summary = this.truncate([this.summary, addition].filter(Boolean).join('\n'), summaryBudget);
      this.messages = this.messages.slice(splitAt);
    }
    return { summary: this.summary, recentMessages: [...this.messages], stateSnapshot, currentInput };
  }

  private truncate(text: string, budget: number): string {
    if (this.countTokens(text) <= budget) return text;
    return text.slice(-budget);
  }
}
