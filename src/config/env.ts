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
  // Ollama
  ollamaBaseUrl: requireUrl("OLLAMA_BASE_URL", "http://203.161.52.27:11434"),
  ollamaSimpleModel: optionalEnv("OLLAMA_SIMPLE_MODEL", "gemma3:1b"),
  ollamaModerateModel: optionalEnv("OLLAMA_MODERATE_MODEL", "gemma3:1b"),
  ollamaComplexModel: optionalEnv("OLLAMA_COMPLEX_MODEL", "gemma3:1b"),
  ollamaVisionModel: optionalEnv("OLLAMA_VISION_MODEL", "gemma3:4b"),
  // How long crawled web search results stay valid in the local cache before
  // a query is considered stale and re-crawled.
  webSearchCacheTtlHours: parseInt(
    optionalEnv("WEB_SEARCH_CACHE_TTL_HOURS", "6"),
    10,
  ),
  // Embedding model used for the semantic search cache.
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
};
