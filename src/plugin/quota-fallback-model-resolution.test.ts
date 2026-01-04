import { describe, it, expect } from "vitest";
import { resolveModelWithTier, MODEL_ALIASES } from "./transform/model-resolver";
import { applyHeaderStyleAliases } from "./quota-fallback";
import { prepareAntigravityRequest } from "./request";

/**
 * Tests for GitHub Issue #100:
 * https://github.com/NoeFabris/opencode-antigravity-auth/issues/100
 * 
 * Bug: When quota_fallback is enabled and Antigravity quota is exhausted,
 * the model is resolved ONCE with the "antigravity-" prefix, which skips
 * MODEL_ALIASES. When we fall back to Gemini CLI, the model name is NOT
 * re-resolved, causing 500 errors.
 * 
 * Root Cause:
 * 1. URL: /models/antigravity-gemini-3-pro-high:streamGenerateContent
 * 2. resolveModelWithTier("antigravity-gemini-3-pro-high")
 *    → Returns "gemini-3-pro-high" (alias SKIPPED because of prefix)
 * 3. Antigravity quota exhausted → headerStyle changes to "gemini-cli"
 * 4. BUG: effectiveModel stays "gemini-3-pro-high" (not re-resolved!)
 * 5. Gemini CLI doesn't recognize "gemini-3-pro-high" → 500 error
 * 
 * Expected Fix:
 * When using Gemini CLI headers, apply MODEL_ALIASES to convert
 * "gemini-3-pro-high" → "gemini-3-pro"
 */
describe("Quota Fallback Model Resolution (Issue #100)", () => {
  describe("Unit Tests: applyHeaderStyleAliases()", () => {
    it("applies alias when headerStyle is gemini-cli", () => {
      const result = applyHeaderStyleAliases("gemini-3-pro-high", "gemini-cli");
      expect(result).toBe("gemini-3-pro");
    });

    it("keeps model unchanged when headerStyle is antigravity", () => {
      const result = applyHeaderStyleAliases("gemini-3-pro-high", "antigravity");
      expect(result).toBe("gemini-3-pro-high");
    });

    it("handles gemini-3-flash-high with gemini-cli", () => {
      const result = applyHeaderStyleAliases("gemini-3-flash-high", "gemini-cli");
      expect(result).toBe("gemini-3-flash");
    });

    it("handles gemini-3-pro-low with gemini-cli", () => {
      const result = applyHeaderStyleAliases("gemini-3-pro-low", "gemini-cli");
      expect(result).toBe("gemini-3-pro");
    });

    it("handles models without aliases gracefully", () => {
      const result = applyHeaderStyleAliases("gemini-2.5-flash", "gemini-cli");
      expect(result).toBe("gemini-2.5-flash"); // No alias, stays unchanged
    });

    it("does not apply alias for Claude models", () => {
      const result = applyHeaderStyleAliases("claude-opus-4-5-thinking", "antigravity");
      expect(result).toBe("claude-opus-4-5-thinking");
    });
  });

  describe("INTEGRATION TEST: prepareAntigravityRequest() with quota fallback", () => {
    const mockAccessToken = "test-access-token";
    const mockProjectId = "test-project-id";

    /**
     * This test FAILS until the fix is integrated into prepareAntigravityRequest.
     * 
     * It simulates the full flow:
     * 1. Request for antigravity-gemini-3-pro-high
     * 2. Using "gemini-cli" headerStyle (after quota fallback)
     * 3. Expects effectiveModel to be "gemini-3-pro" (alias applied)
     */
    it("FAILS: prepareAntigravityRequest should apply alias when using gemini-cli", () => {
      const requestUrl = "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-pro-high:generateContent";
      const requestInit: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        }),
      };

      // Simulate quota fallback: using gemini-cli headers
      const prepared = prepareAntigravityRequest(
        requestUrl,
        requestInit,
        mockAccessToken,
        mockProjectId,
        undefined, // endpointOverride
        "gemini-cli", // headerStyle - THIS IS THE FALLBACK
        false, // forceThinkingRecovery
        { claudeToolHardening: false },
      );

      // EXPECTED: effectiveModel should be "gemini-3-pro" (alias applied)
      // ACTUAL (BUG): effectiveModel is "gemini-3-pro-high" (alias NOT applied)
      expect(prepared.effectiveModel).toBe("gemini-3-pro");
    });

    it("FAILS: prepareAntigravityRequest should handle gemini-3-flash-high", () => {
      const requestUrl = "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-flash-high:streamGenerateContent";
      const requestInit: RequestInit = {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Test" }] }],
        }),
      };

      const prepared = prepareAntigravityRequest(
        requestUrl,
        requestInit,
        mockAccessToken,
        mockProjectId,
        undefined,
        "gemini-cli",
        false,
        {},
      );

      expect(prepared.effectiveModel).toBe("gemini-3-flash");
    });

    it("prepareAntigravityRequest should NOT apply alias when using antigravity", () => {
      const requestUrl = "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-pro-high:generateContent";
      const requestInit: RequestInit = {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        }),
      };

      const prepared = prepareAntigravityRequest(
        requestUrl,
        requestInit,
        mockAccessToken,
        mockProjectId,
        undefined,
        "antigravity", // Using Antigravity headers
        false,
        {},
      );

      // When using Antigravity, tier-suffixed models should stay unchanged
      expect(prepared.effectiveModel).toBe("gemini-3-pro-high");
    });

    it("handles models without tier suffixes", () => {
      const requestUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      const requestInit: RequestInit = {
        method: "POST",
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Test" }] }],
        }),
      };

      const prepared = prepareAntigravityRequest(
        requestUrl,
        requestInit,
        mockAccessToken,
        mockProjectId,
        undefined,
        "gemini-cli",
        false,
        {},
      );

      // No alias exists for this model
      expect(prepared.effectiveModel).toBe("gemini-2.5-flash");
    });
  });
});
