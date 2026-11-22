// Shared by the Ollama and llama.cpp backends. Name kept as
// OllamaUnavailableError because routes already catch it by that name.
export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}
