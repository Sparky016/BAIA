/**
 * Nest DI token for the provider-agnostic {@link LlmService}.
 *
 * Always inject the contract through this token — never the concrete class — so
 * the bound implementation (mock vs. Copilot adapter) stays swappable:
 *
 * ```ts
 * constructor(@Inject(LLM_SERVICE) private readonly llm: LlmService) {}
 * ```
 */
export const LLM_SERVICE = Symbol('LLM_SERVICE');
