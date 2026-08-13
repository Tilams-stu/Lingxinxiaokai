export class SessionContextManager {
    reserveTokens;
    keepRecentTokens;
    contextWindow;
    countTokens;
    messages = [];
    summary = '';
    constructor(options = {}) {
        this.contextWindow = options.contextWindow ?? 1_000_000;
        this.reserveTokens = options.reserveTokens ?? 16_384;
        this.keepRecentTokens = options.keepRecentTokens ?? 20_000;
        this.countTokens = options.countTokens ?? ((text) => Math.ceil(text.length / 4));
    }
    addMessage(message) { this.messages.push(message); }
    buildContext(stateSnapshot, currentInput) {
        const inputTokens = this.countTokens(currentInput) + this.countTokens(JSON.stringify(stateSnapshot)) + this.countTokens(this.summary);
        const availableTokens = Math.max(0, Math.min(this.keepRecentTokens, this.contextWindow - this.reserveTokens - inputTokens));
        let recentTokens = 0;
        let splitAt = this.messages.length;
        for (let index = this.messages.length - 1; index >= 0; index -= 1) {
            const tokens = this.countTokens(this.messages[index].content);
            if (recentTokens + tokens > availableTokens)
                break;
            recentTokens += tokens;
            splitAt = index;
        }
        const compacted = this.messages.slice(0, splitAt);
        if (compacted.length) {
            const addition = compacted.map((message) => `${message.role}: ${message.content}`).join('\n');
            this.summary = [this.summary, addition].filter(Boolean).join('\n');
            this.messages = this.messages.slice(splitAt);
        }
        return { summary: this.summary, recentMessages: [...this.messages], stateSnapshot, currentInput };
    }
}
