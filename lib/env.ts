export type AppConfig = {
  databaseUrl: string;
  nebiusApiKey: string;
  nebiusBaseUrl: string;
  extractModel: string;
  explainModel: string;
  explainFallbackModel: string;
  visionModel: string;
  tavilyApiKey: string;
};

const DEFAULT_EXTRACT = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
const DEFAULT_EXPLAIN = "nvidia/Nemotron-3-Ultra-550b-a55b";
const DEFAULT_EXPLAIN_FALLBACK = "nvidia/nemotron-3-super-120b-a12b";
const DEFAULT_VISION = "nvidia/Nemotron-3.5-Super-VL";
const DEFAULT_BASE = "https://api.tokenfactory.nebius.com/v1";

export function appConfig(): AppConfig {
  return {
    databaseUrl: process.env.DATABASE_URL || "postgres://arween:arween@127.0.0.1:5432/arween",
    nebiusApiKey: (process.env.NEBIUS_API_KEY || "").trim(),
    nebiusBaseUrl: (process.env.NEBIUS_BASE_URL || DEFAULT_BASE).replace(/\/$/, ""),
    extractModel: (process.env.NEBIUS_EXTRACT_MODEL || DEFAULT_EXTRACT).trim(),
    explainModel: (process.env.NEBIUS_EXPLAIN_MODEL || DEFAULT_EXPLAIN).trim(),
    explainFallbackModel: (process.env.NEBIUS_EXPLAIN_FALLBACK_MODEL || DEFAULT_EXPLAIN_FALLBACK).trim(),
    visionModel: (process.env.NEBIUS_VISION_MODEL || DEFAULT_VISION).trim(),
    tavilyApiKey: (process.env.TAVILY_API_KEY || "").trim(),
  };
}

export function demoFlags() {
  const config = appConfig();
  return {
    nebius: config.nebiusApiKey.length === 0,
    tavily: config.tavilyApiKey.length === 0,
  };
}
