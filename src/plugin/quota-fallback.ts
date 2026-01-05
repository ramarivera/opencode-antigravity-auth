import { MODEL_ALIASES } from "./transform/model-resolver";
import type { HeaderStyle } from "../constants";

/**
 * Applies Gemini CLI model aliases when quota_fallback is enabled.
 * Converts tier-suffixed models (e.g., "gemini-3-pro-high") to base models
 * used by Gemini CLI (e.g., "gemini-3-pro").
 */
export function applyHeaderStyleAliases(
  effectiveModel: string,
  headerStyle: HeaderStyle
): string {
  if (headerStyle !== "gemini-cli") {
    return effectiveModel;
  }

  // Preserve CLI preview identifiers to avoid 404s.
  if (effectiveModel.endsWith("-preview")) {
    return effectiveModel;
  }

  const previewOverrides: Record<string, string> = {
    "gemini-3-pro": "gemini-3-pro-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
    "gemini-3-pro-image": "gemini-3-pro-image-preview",
  };

  if (previewOverrides[effectiveModel]) {
    return previewOverrides[effectiveModel];
  }

  // Map tiered Gemini 3 models to CLI preview variants.
  const tierMatch = effectiveModel.match(/^gemini-3-(pro|flash)-(low|medium|high)$/);
  if (tierMatch) {
    return `gemini-3-${tierMatch[1]}-preview`;
  }

  return MODEL_ALIASES[effectiveModel] || effectiveModel;
}
