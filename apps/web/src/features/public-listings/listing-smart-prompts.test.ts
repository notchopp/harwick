import { describe, expect, it } from "vitest";
import type { ListingMemory } from "@realty-ops/core";

import { deriveSmartPrompts } from "./listing-smart-prompts";

const baseListing = {
  listingId: "00000000-0000-0000-0000-000000000001",
  price: null,
  beds: null,
  baths: null,
  rawFacts: {},
};

function memoryRow(overrides: Partial<ListingMemory> & Pick<ListingMemory, "prompt" | "kind" | "visibility">): ListingMemory {
  return {
    id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
    workspaceId: "22222222-2222-2222-2222-222222222222",
    listingId: baseListing.listingId,
    kind: overrides.kind,
    visibility: overrides.visibility,
    prompt: overrides.prompt,
    content: overrides.content ?? "ignored",
    source: overrides.source ?? "operator",
    displayOrder: overrides.displayOrder ?? 0,
    createdByMemberId: overrides.createdByMemberId ?? null,
    createdAt: "2026-05-25T12:00:00.000Z",
    updatedAt: "2026-05-25T12:00:00.000Z",
  };
}

describe("deriveSmartPrompts", () => {
  it("returns the operator-authored public memory chips first, then closes with showing", () => {
    const result = deriveSmartPrompts({
      listing: baseListing,
      memory: [
        memoryRow({
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          kind: "common_question",
          visibility: "public",
          prompt: "Most buyers ask about schools.",
        }),
        memoryRow({
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          kind: "incentive",
          visibility: "public",
          prompt: "Builder offers closing-cost help right now.",
        }),
      ],
    });

    expect(result).toHaveLength(3);
    expect(result[0]?.label).toBe("Most buyers ask about schools.");
    expect(result[1]?.label).toBe("Builder offers closing-cost help right now.");
    expect(result[2]?.kind).toBe("showing");
  });

  it("skips memory rows that are internal-only", () => {
    const result = deriveSmartPrompts({
      listing: baseListing,
      memory: [
        memoryRow({
          kind: "context_note",
          visibility: "internal",
          prompt: "Seller will not budge on price.",
        }),
      ],
    });

    expect(result.find((entry) => entry.kind === "context_note")).toBeUndefined();
  });

  it("derives heuristic prompts when memory is empty and facts justify them", () => {
    const result = deriveSmartPrompts({
      listing: {
        listingId: baseListing.listingId,
        price: 625_000,
        beds: 4,
        baths: 3,
        rawFacts: {
          schoolDistrict: "Katy ISD",
          incentives: ["Closing-cost credit up to $15k"],
          hasPool: true,
          squareFeet: 2850,
        },
      },
      memory: [],
    });

    const kinds = result.map((entry) => entry.kind);
    expect(kinds).toContain("school");
    expect(kinds).toContain("incentive");
    expect(kinds).toContain("financing");
    expect(kinds).toContain("amenity");
    expect(result).toHaveLength(5);
  });

  it("does not invent a school prompt when no school field is present", () => {
    const result = deriveSmartPrompts({
      listing: { ...baseListing, price: 800_000 },
      memory: [],
    });
    expect(result.some((entry) => entry.kind === "school")).toBe(false);
  });

  it("caps at 5 prompts even when both memory and heuristics overflow", () => {
    const result = deriveSmartPrompts({
      listing: {
        listingId: baseListing.listingId,
        price: 900_000,
        beds: 5,
        baths: 4,
        rawFacts: {
          schoolDistrict: "Spring Branch ISD",
          incentives: ["Title fee paid"],
          hasPool: true,
          squareFeet: 4200,
        },
      },
      memory: Array.from({ length: 8 }, (_, index) =>
        memoryRow({
          id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(index).padStart(12, "0")}`,
          kind: "common_question",
          visibility: "public",
          prompt: `Operator prompt ${index + 1}`,
          displayOrder: index,
        }),
      ),
    });

    expect(result).toHaveLength(5);
    expect(result.every((entry) => entry.label.startsWith("Operator prompt"))).toBe(true);
  });
});
