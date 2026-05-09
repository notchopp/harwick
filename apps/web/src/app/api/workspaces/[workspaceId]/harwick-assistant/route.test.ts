import { describe, expect, it } from "vitest";
import { describeHarwickAssistantRuntimeError } from "./route";

describe("describeHarwickAssistantRuntimeError", () => {
  it("surfaces insufficient quota cleanly", () => {
    expect(describeHarwickAssistantRuntimeError(
      new Error("OpenAI Harwick assistant failed (429): {\"error\":{\"code\":\"insufficient_quota\"}}"),
    )).toEqual({
      message: "Harwick couldn't catch that. Try again.",
      status: 429,
    });
  });

  it("maps malformed model output to a runtime message", () => {
    expect(describeHarwickAssistantRuntimeError(
      new Error("OpenAI response did not include text output."),
    )).toEqual({
      message: "Harwick couldn't catch that. Try again.",
      status: 502,
    });
  });
});
