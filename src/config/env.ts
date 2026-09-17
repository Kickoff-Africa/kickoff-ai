import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireUrl(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    throw new Error(
      `${name} must include the protocol (e.g. https://). Got: "${value}"`,
    );
  }
  return value.replace(/\/$/, ""); // strip trailing slash
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiry: process.env.JWT_EXPIRY ?? "24h",
  magicLinkExpiryMinutes: parseInt(
    process.env.MAGIC_LINK_EXPIRY_MINUTES ?? "15",
    10,
  ),
  useSendApiKey: requireEnv("USESEND_API_KEY"),
  useSendBaseUrl: process.env.USESEND_BASE_URL ?? "https://app.usesend.com/api",
  emailFrom: process.env.EMAIL_FROM ?? "noreply@kickoff.africa",
  appUrl: requireUrl("APP_URL", "http://localhost:3000"),
  frontendUrl: requireUrl("FRONTEND_URL", "http://localhost:3000"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? null,
  adminEmail: requireEnv("ADMIN_EMAIL"),
  cloudinaryCloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
  cloudinaryApiKey: requireEnv("CLOUDINARY_API_KEY"),
  cloudinaryApiSecret: requireEnv("CLOUDINARY_API_SECRET"),
  // Ollama — chat generation and title generation run against Ollama's cloud
  // API (ollama.com), not a self-hosted box: same request/response shape as
  // self-hosted Ollama, just authenticated and remotely hosted. Embeddings
  // and vision stay on the original self-hosted box below, since Ollama's
  // cloud tier only offers chat models, no embedding or vision models.
  ollamaCloudBaseUrl: requireUrl("OLLAMA_CLOUD_BASE_URL", "https://ollama.com"),
  ollamaApiKey: requireEnv("OLLAMA_API_KEY"),
  ollamaSimpleModel: optionalEnv("OLLAMA_SIMPLE_MODEL", "gpt-oss:120b-cloud"),
  ollamaModerateModel: optionalEnv("OLLAMA_MODERATE_MODEL", "gpt-oss:120b-cloud"),
  ollamaComplexModel: optionalEnv("OLLAMA_COMPLEX_MODEL", "gpt-oss:120b-cloud"),
  // Self-hosted Ollama box: embeddings, plus vision if that path is ever
  // re-enabled (see messages.ts — image attachments currently return 503).
  ollamaBaseUrl: requireUrl("OLLAMA_BASE_URL", "http://203.161.52.27:11434"),
  ollamaVisionModel: optionalEnv("OLLAMA_VISION_MODEL", "gemma3:4b"),
  // Rough character budget (no tokenizer available here, so this is an
  // approximation, not a token-exact bound) for conversation history included
  // in a chat prompt. Without this, the full conversation accumulates into
  // every prompt unbounded, and on a long conversation could eventually
  // exceed the model's context window or just balloon latency/cost.
  // Truncating explicitly, oldest-first, keeps behavior predictable and
  // leaves headroom for the system prompt, injected web search/knowledge
  // base context, and the response itself.
  chatHistoryCharBudget: parseInt(optionalEnv("CHAT_HISTORY_CHAR_BUDGET", "12000"), 10),
  // How long crawled web search results stay valid in the local cache before
  // a query is considered stale and re-crawled.
  webSearchCacheTtlHours: parseInt(
    optionalEnv("WEB_SEARCH_CACHE_TTL_HOURS", "6"),
    10,
  ),
  // Embedding model used for the semantic search cache and knowledge base —
  // runs on the self-hosted Ollama box (see ollamaBaseUrl above).
  ollamaEmbedModel: optionalEnv("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
  // Minimum cosine similarity for a cached query to count as a match for a
  // new one. Lower = more cache hits but more risk of an off-topic match.
  webSearchCacheSimilarityThreshold: parseFloat(
    optionalEnv("WEB_SEARCH_CACHE_SIMILARITY_THRESHOLD", "0.92"),
  ),
  // Self-hosted ChromaDB instance backing the semantic search cache.
  chromaUrl: requireUrl("CHROMA_URL", "http://localhost:8000"),
  chromaCollectionName: optionalEnv(
    "CHROMA_COLLECTION_NAME",
    "web_search_cache",
  ),
  // Knowledge base: admin-uploaded documents plus the daily news/sports/etc
  // digest, retrieved by embedding similarity and injected into chat prompts.
  chromaKnowledgeBaseCollectionName: optionalEnv(
    "CHROMA_KNOWLEDGE_BASE_COLLECTION_NAME",
    "knowledge_base",
  ),
  // Minimum cosine similarity for a knowledge base chunk to be considered
  // relevant to a user's message. Empirically, with nomic-embed-text and
  // proper search_query/search_document task prefixes, genuinely relevant
  // question/passage pairs score ~0.40-0.48 while unrelated ones score
  // ~0.0 or negative — 0.35 sits comfortably above the noise floor with
  // margin below real matches. Much lower than the search cache threshold
  // because this compares a question against document content (asymmetric),
  // not two near-identical queries (symmetric).
  knowledgeBaseSimilarityThreshold: parseFloat(
    optionalEnv("KNOWLEDGE_BASE_SIMILARITY_THRESHOLD", "0.35"),
  ),
  // Max knowledge base chunks injected into a single chat prompt.
  knowledgeBaseTopK: parseInt(optionalEnv("KNOWLEDGE_BASE_TOP_K", "3"), 10),
  // Topics the daily digest job crawls and refreshes in the knowledge base.
  dailyDigestTopics: optionalEnv(
    "DAILY_DIGEST_TOPICS",
    "top news headlines today,sports scores and news today,arts and entertainment news today",
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
  // Cron schedule (node-cron/crontab syntax) for refreshing the daily digest.
  dailyDigestCronSchedule: optionalEnv("DAILY_DIGEST_CRON_SCHEDULE", "0 6 * * *"),
  // The self-hosted Ollama box is a single CPU-bound instance that can only
  // run one generation at a time — concurrent requests don't parallelize,
  // they thrash (we've seen it OOM-kill under load). Only the vision path
  // still runs there (see ollamaBaseUrl above); normal chat now runs on
  // Ollama's cloud API and isn't subject to this limit.
  ollamaMaxConcurrency: parseInt(optionalEnv("OLLAMA_MAX_CONCURRENCY", "1"), 10),
  // Embeddings get their own, separate queue lane on the self-hosted box —
  // nomic-embed-text is small enough to stay resident in memory alongside a
  // loaded vision model without evicting it (verified directly against this
  // host), so a KB lookup doesn't need to queue behind an in-flight vision
  // generation the way it would sharing one concurrency=1 queue.
  ollamaEmbedConcurrency: parseInt(optionalEnv("OLLAMA_EMBED_CONCURRENCY", "2"), 10),
  // Hard deadline for small, fixed-size Ollama calls (title/embed), so one
  // wedged request can't block the queue, and therefore every other user,
  // forever.
  ollamaQuickTimeoutMs: parseInt(optionalEnv("OLLAMA_QUICK_TIMEOUT_MS", "30000"), 10),
  // Hard deadline for full chat generation. Generous because the vision path
  // still runs on the CPU-bound self-hosted box (well under 1 token/sec) even
  // though normal cloud chat is much faster — this is a safety net against a
  // true hang, not a bound on normal response time.
  ollamaChatTimeoutMs: parseInt(optionalEnv("OLLAMA_CHAT_TIMEOUT_MS", "600000"), 10),
};
