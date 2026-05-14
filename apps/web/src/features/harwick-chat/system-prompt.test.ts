import { describe, expect, it } from "vitest";

import { buildHarwickChatSystemPrompt } from "./system-prompt";

const baseParams = {
  operatorName: "Coya Rivera",
  workspaceName: "Coya Systems",
  currentDate: "2026-05-14",
};

describe("buildHarwickChatSystemPrompt", () => {
  it("addresses the operator by first name in examples", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "owner" });
    expect(prompt).toContain("Coya, you've got three things stacked up.");
  });

  it("includes role-mode block for owner", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "owner" });
    expect(prompt).toContain("ROLE MODE: OWNER / ADMIN");
    expect(prompt).not.toContain("ROLE MODE: AGENT");
  });

  it("includes team-lead role mode for lead_manager", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "lead_manager" });
    expect(prompt).toContain("ROLE MODE: TEAM LEAD");
  });

  it("includes agent role mode for plain agent role", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "agent" });
    expect(prompt).toContain("ROLE MODE: AGENT");
    expect(prompt).toContain("your queue");
  });

  it("includes viewer guardrails for viewer role", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "viewer" });
    expect(prompt).toContain("ROLE MODE: VIEWER");
    expect(prompt).toContain("read-only");
  });

  it("authorizes the agent to use web_search, create_channel, and scheduled loops", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "owner" });
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("create_channel");
    expect(prompt).toContain("create_scheduled_loop");
    expect(prompt).toContain("YOUR AGENCY");
  });

  it("forbids bullet-point lists and lengthy enumerations", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "owner" });
    expect(prompt).toContain("NEVER bullet points");
    expect(prompt).toContain("NEVER enumerate every lead");
  });

  it("references the current date so date-relative answers stay anchored", () => {
    const prompt = buildHarwickChatSystemPrompt({ ...baseParams, operatorRole: "owner" });
    expect(prompt).toContain("Today is 2026-05-14");
  });
});
