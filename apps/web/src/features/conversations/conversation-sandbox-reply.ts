import type { ConversationInboxMessage, ConversationInboxThread } from "@realty-ops/core";

export type SandboxReplySuggestion = {
  id: string;
  label: string;
  reply: string;
};

export type SandboxReplySet = {
  primary: SandboxReplySuggestion;
  suggestions: SandboxReplySuggestion[];
  coachNote: string;
  detectedSignals: string[];
};

type SandboxConversationSignals = {
  latestLeadText: string;
  latestLeadTextLower: string;
  latestAgentTextLower: string | null;
  firstName: string;
  area: string | null;
  budget: string | null;
  timeline: string | null;
  financing: string | null;
  phone: string | null;
  email: string | null;
  introduced: boolean;
  askedForPhone: boolean;
  askedForTimeline: boolean;
  askedForBudget: boolean;
  askedForFinancing: boolean;
  greeting: boolean;
  identity: boolean;
  trustConcern: boolean;
  browsing: boolean;
  financingQuestion: boolean;
  blueprintRequest: boolean;
  showingRequest: boolean;
  showingWindow: string | null;
  listingQuestion: boolean;
  relocation: boolean;
  humanReview: boolean;
  notPreapproved: boolean;
  detectedSignals: string[];
};

const greetingKeywords = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"];
const identityKeywords = ["who are you", "who is this", "is this a bot", "are you a bot", "real person", "what is harwick"];
const trustKeywords = ["legit", "real", "scam", "licensed", "reviews", "review", "website", "brokerage", "proof"];
const browsingKeywords = ["just browsing", "just looking", "not ready", "maybe later", "still early", "looking around"];
const financingKeywords = [
  "pre-approve",
  "preapprove",
  "pre approved",
  "pre-approved",
  "mortgage",
  "down payment",
  "interest rate",
  "monthly payment",
  "lender",
  "loan",
  "finance",
  "credit score",
];
const blueprintKeywords = ["blueprint", "guide", "checklist", "plan"];
const showingKeywords = ["tour", "showing", "see it", "see this", "walkthrough", "walk through", "view it", "visit", "private showing", "when can i come"];
const listingKeywords = ["price", "available", "details", "info", "information", "location", "address", "hoa", "sqft", "square feet", "bed", "bath", "photos", "pictures", "neighborhood", "community"];
const relocationKeywords = ["relocating", "moving from", "moving to", "new to the area", "schools", "school district", "commute"];
const humanReviewKeywords = ["guarantee", "guaranteed", "legal", "attorney", "lawyer", "contract advice", "tax advice", "sure approval", "promise approval", "roi"];
const phonePattern = /(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function latestMessage(thread: ConversationInboxThread, kinds: ConversationInboxMessage["kind"][]): string | null {
  const match = [...thread.messages].reverse().find((message) => kinds.includes(message.kind));
  return match?.body ?? null;
}

function findMatch(texts: string[], pattern: RegExp): string | null {
  for (const text of texts) {
    const match = text.match(pattern);
    if (match !== null) {
      return match[0] ?? null;
    }
  }
  return null;
}

function trimReply(reply: string): string {
  return reply.replace(/\s+/g, " ").trim();
}

function buildSuggestion(id: string, label: string, reply: string): SandboxReplySuggestion {
  return {
    id,
    label,
    reply: trimReply(reply),
  };
}

function buildReplySet(
  coachNote: string,
  detectedSignals: string[],
  suggestions: SandboxReplySuggestion[],
): SandboxReplySet {
  return {
    primary: suggestions[0]!,
    suggestions,
    coachNote,
    detectedSignals,
  };
}

function readSignals(thread: ConversationInboxThread): SandboxConversationSignals {
  const latestLeadText = latestMessage(thread, ["lead"]) ?? thread.preview;
  const latestLeadTextLower = normalize(latestLeadText);
  const latestAgentText = latestMessage(thread, ["sent", "ai_action"]);
  const latestAgentTextLower = latestAgentText === null ? null : normalize(latestAgentText);
  const leadTexts = thread.messages.filter((message) => message.kind === "lead").map((message) => message.body);
  const allTexts = thread.messages.map((message) => message.body);
  const firstName = thread.name.split(" ")[0] ?? thread.name;
  const area = thread.area === "Unknown" ? null : thread.area;
  const budget = thread.budget === "Unknown" ? null : thread.budget;
  const timeline = thread.timeline === "Unknown" ? null : thread.timeline;
  const phone = findMatch(leadTexts, phonePattern);
  const email = findMatch(leadTexts, emailPattern);
  const financing = allTexts
    .map((text) => normalize(text))
    .find((text) => /\b(pre-approve|preapprove|pre approved|pre-approved|approved|cash|fha|va|conventional|lender)\b/.test(text))
    ?? null;
  const introduced = allTexts.some((text) => {
    const normalized = normalize(text);
    return normalized.includes("harwick") || normalized.includes("with the team");
  });
  const askedForPhone = latestAgentTextLower?.includes("phone") === true || latestAgentTextLower?.includes("number") === true;
  const askedForTimeline = latestAgentTextLower?.includes("timeline") === true || latestAgentTextLower?.includes("move") === true;
  const askedForBudget = latestAgentTextLower?.includes("budget") === true || latestAgentTextLower?.includes("price range") === true;
  const askedForFinancing = latestAgentTextLower?.includes("pre-approved") === true || latestAgentTextLower?.includes("lender") === true;
  const greeting = includesKeyword(latestLeadTextLower, greetingKeywords);
  const identity = includesKeyword(latestLeadTextLower, identityKeywords);
  const trustConcern = identity || includesKeyword(latestLeadTextLower, trustKeywords);
  const browsing = includesKeyword(latestLeadTextLower, browsingKeywords);
  const financingQuestion = includesKeyword(latestLeadTextLower, financingKeywords);
  const blueprintRequest = includesKeyword(latestLeadTextLower, blueprintKeywords);
  const showingRequest = includesKeyword(latestLeadTextLower, showingKeywords);
  const showingWindow = [...leadTexts]
    .reverse()
    .find((text) => /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) || /\bafter\s+\d|\b\d{1,2}\s?(am|pm)\b/i.test(text))
    ?? null;
  const listingQuestion = includesKeyword(latestLeadTextLower, listingKeywords);
  const relocation = includesKeyword(latestLeadTextLower, relocationKeywords) || thread.intentType.toLowerCase().includes("relocation");
  const humanReview = includesKeyword(latestLeadTextLower, humanReviewKeywords);
  const notPreapproved = latestLeadTextLower.includes("not preapproved")
    || latestLeadTextLower.includes("not pre-approved")
    || latestLeadTextLower.includes("not approved yet");

  const detectedSignals = [
    showingRequest ? "showing request" : null,
    phone !== null ? "phone captured" : null,
    email !== null ? "email captured" : null,
    financing !== null ? "financing captured" : null,
    budgetingSignal(budget, askedForBudget),
    timeline !== null ? "timeline known" : null,
    relocation ? "relocation context" : null,
    browsing ? "light-intent browsing" : null,
    trustConcern ? "trust check" : null,
    blueprintRequest ? "blueprint request" : null,
  ].filter((value): value is string => value !== null);

  return {
    latestLeadText,
    latestLeadTextLower,
    latestAgentTextLower,
    firstName,
    area,
    budget,
    timeline,
    financing,
    phone,
    email,
    introduced,
    askedForPhone,
    askedForTimeline,
    askedForBudget,
    askedForFinancing,
    greeting,
    identity,
    trustConcern,
    browsing,
    financingQuestion,
    blueprintRequest,
    showingRequest,
    showingWindow,
    listingQuestion,
    relocation,
    humanReview,
    notPreapproved,
    detectedSignals,
  };
}

function budgetingSignal(budget: string | null, askedForBudget: boolean): string | null {
  if (budget !== null) {
    return "budget known";
  }
  return askedForBudget ? "budget pending" : null;
}

function nextQuestion(thread: ConversationInboxThread, signals: SandboxConversationSignals): string {
  if (signals.showingRequest && signals.phone === null) {
    return "What is the best phone number for the showing confirmation?";
  }
  if (signals.timeline === null) {
    return "What timeline are you working with?";
  }
  if (signals.budget === null && thread.intentType !== "Rental") {
    return "What price range do you want me to stay inside?";
  }
  if (signals.financing === null && thread.intentType !== "Rental") {
    return "Are you already pre-approved, or are you still early in that part?";
  }
  return "Do you want me to line up the next step or a few comparable options?";
}

function buildTrustReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const teamOwner = thread.assignedTo === "Unassigned" ? "the team" : `${thread.assignedTo}'s team`;
  const areaLabel = signals.area ?? "the homes you asked about";
  return buildReplySet(
    "Trust question detected. Best move: explain who Harwick is, reduce friction, and offer a direct human handoff.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `I’m Harwick with ${teamOwner} — here to help with ${areaLabel}, answer questions fast, and tee up the next step. If you’d rather talk directly with ${thread.assignedTo}, I can line that up too. Do you want the details first or the next available showing?`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `Totally fair question. I’m Harwick with ${teamOwner}, and I help keep listing questions, follow-up, and showings moving without the back-and-forth. If you want, I can also connect you directly with ${thread.assignedTo}.`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `I’m Harwick with ${teamOwner}. I can send details, answer questions, or line up a tour for ${areaLabel}. Want me to start with the listing details or a showing?`,
      ),
      buildSuggestion(
        "handoff",
        "Human handoff",
        `Absolutely — if you prefer, I can have ${thread.assignedTo} jump in directly. What is the best number for the handoff, and do you want details on ${thread.listingTitle.toLowerCase()} in the meantime?`,
      ),
    ],
  );
}

function buildShowingReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const areaLabel = signals.area ?? thread.listingTitle;
  const dayContext = signals.showingWindow;
  if (signals.askedForPhone && signals.phone !== null) {
    const financingSnippet = signals.financing !== null || signals.budget !== null
      ? ` and noted ${signals.financing ?? signals.budget}`
      : "";
    return buildReplySet(
      "Lead gave contact info after a showing ask. Best move: confirm the contact details, acknowledge readiness, and advance the tour.",
      signals.detectedSignals,
      [
        buildSuggestion(
          "balanced",
          "Balanced",
          `Perfect — I’ve got ${signals.phone}${financingSnippet}. I’ll have the team check ${dayContext !== null && dayContext.toLowerCase().includes("friday") ? "Friday after 5" : "the best available time"} for ${areaLabel} and send over the best slot. Will it just be you, or is anyone else joining the tour?`,
        ),
        buildSuggestion(
          "warmer",
          "Warmer",
          `Perfect, thanks ${signals.firstName}. I have your number${financingSnippet}, and I’ll keep the tour request moving for ${areaLabel}. If Friday after 5 opens up, should I hold the earliest slot or the later evening one?`,
        ),
        buildSuggestion(
          "direct",
          "Direct",
          `Got it — ${signals.phone}${financingSnippet}. I’m checking the best tour slot for ${areaLabel} now. Should I plan for just you or anyone else too?`,
        ),
      ],
    );
  }

  return buildReplySet(
    "Showing request detected. Best move: confirm interest and collect the one missing field needed to lock the appointment.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `Absolutely — I can help line up a tour for ${areaLabel}. ${nextQuestion(thread, signals)}`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `That one is worth seeing. I can help get a showing moving for ${areaLabel}. ${nextQuestion(thread, signals)}`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `Yes — I can set that up for ${areaLabel}. ${nextQuestion(thread, signals)}`,
      ),
    ],
  );
}

function buildFinancingReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  if (signals.notPreapproved) {
    return buildReplySet(
      "Lead is not pre-approved yet. Best move: reduce pressure, keep search alive, and offer lender help without blocking the conversation.",
      signals.detectedSignals,
      [
        buildSuggestion(
          "balanced",
          "Balanced",
          "No problem at all — a lot of buyers start there. You can still narrow neighborhoods and homes now, and when you’re ready I can connect you with a lender. Do you want to keep browsing first or get pre-approval info?",
        ),
        buildSuggestion(
          "warmer",
          "Warmer",
          "Totally fine — you do not need to have everything lined up on day one. I can help you keep the search moving and point you toward a solid lender when you’re ready. Want to browse first or talk through financing?",
        ),
        buildSuggestion(
          "direct",
          "Direct",
          "That’s okay. You can browse now and get pre-approved when you’re ready. Want lender options, or should I keep sending the best matches first?",
        ),
      ],
    );
  }

  return buildReplySet(
    "Financing question detected. Best move: stay safe, give a high-level answer, and ask one useful follow-up.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        "Down payment depends on the loan program, but many buyers start anywhere from 3% to 20%. I can connect you with a lender and keep the search moving. Have you spoken with a lender yet, or are you just starting that part?",
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        "Great question. The exact number depends on the loan program, but plenty of buyers begin in that 3% to 20% range. If you want, I can help with both the home search and a lender intro so it all stays simple.",
      ),
      buildSuggestion(
        "direct",
        "Direct",
        "It depends on the loan type, but many buyers land somewhere between 3% and 20%. If you want, I can line up lender options and keep the home search moving at the same time.",
      ),
    ],
  );
}

function buildBlueprintReplySet(signals: SandboxConversationSignals): SandboxReplySet {
  return buildReplySet(
    "Blueprint request detected. Best move: deliver value fast, then ask one anchor question so the follow-up stays targeted.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        "Absolutely — I can send the buyer blueprint and pull a few strong matches for you. What area or timeline should I anchor the search around?",
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        "Absolutely. I’ll get the buyer blueprint over and can narrow the next options so they actually fit. What should I optimize around first — area, budget, or timing?",
      ),
      buildSuggestion(
        "direct",
        "Direct",
        "Yes — I can send the blueprint and a short list of real fits. What area and timeline should I use?",
      ),
    ],
  );
}

function buildBrowsingReplySet(signals: SandboxConversationSignals): SandboxReplySet {
  return buildReplySet(
    "Low-pressure browsing detected. Best move: keep the tone light and ask for just enough detail to avoid sending junk.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        "Absolutely — no pressure at all. I can keep this light and send a few solid options so you can watch the market. Which area or price range should I use so I do not send you junk?",
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        "Totally get it. Browsing is actually the best way to get a feel for the market without forcing anything. If you want, I can keep it simple and only send the kinds of homes you’d genuinely click on.",
      ),
      buildSuggestion(
        "direct",
        "Direct",
        "No problem. I can keep it low-pressure and send only the strongest matches. What neighborhood or price range should I stay inside?",
      ),
    ],
  );
}

function buildRelocationReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const areaLabel = signals.area ?? "the area";
  return buildReplySet(
    "Relocation context detected. Best move: reduce overwhelm and narrow the search around lifestyle needs instead of generic listings.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `Absolutely — I can help make the move feel a lot less overwhelming. In ${areaLabel}, I can narrow options around commute, schools, and how turnkey you want the home to be. Which of those matters most first?`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `That’s exciting — and moving into a new market can feel like a lot fast. I can help narrow ${areaLabel} into the pockets that actually fit your budget and day-to-day life. Do you care more about schools, commute, or newer homes first?`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `Yes — I can narrow ${areaLabel} quickly. Should I optimize first for schools, commute, or the strongest homes under ${signals.budget ?? "your target budget"}?`,
      ),
    ],
  );
}

function buildListingReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const detail = thread.listingDetails.length > 0 ? thread.listingDetails : thread.listingTitle;
  return buildReplySet(
    "Listing question detected. Best move: answer from known listing context, then ask one qualification question.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `I can send the full details on that one. Right now I have ${detail}. ${nextQuestion(thread, signals)}`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `Absolutely — happy to send more on it. From what I have, it’s ${detail}. ${signals.timeline === null ? "Are you looking to move soon or still getting a feel for the market?" : "Want me to line up a tour or a few similar options next?"}`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `Yes — I have ${detail}. ${nextQuestion(thread, signals)}`,
      ),
    ],
  );
}

function buildGreetingReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const areaLabel = signals.area ?? thread.listingTitle;
  return buildReplySet(
    "Simple opener detected. Best move: introduce Harwick naturally and give the lead an easy menu of next steps.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `Hey — Harwick here with the team. I can help with ${areaLabel} and the next step from here. Are you looking for pricing, a tour, or a few comparable options?`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `Hey ${signals.firstName} — Harwick here with the team. Happy to help however you want to approach this. Do you want the quick details first, or should we talk next steps?`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `Hey — Harwick with the team. Want pricing, details, or the next available showing for ${areaLabel}?`,
      ),
    ],
  );
}

function buildHumanReviewReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  return buildReplySet(
    "Risky or certainty-seeking question detected. Best move: avoid guessing and move to a human handoff fast.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `I can have ${thread.assignedTo} confirm the exact financing or legal details so nothing gets guessed here. What is the best number or email for the handoff?`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `I want to keep this accurate for you, so I’d rather have ${thread.assignedTo} confirm the exact financing or legal side directly. What is the best number or email to reach you?`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `That part needs a direct human review. Send me the best number or email, and I’ll have ${thread.assignedTo} follow up.`,
      ),
    ],
  );
}

function buildGeneralReplySet(thread: ConversationInboxThread, signals: SandboxConversationSignals): SandboxReplySet {
  const context = [thread.intentType, signals.area, signals.timeline, signals.budget]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(" • ");
  return buildReplySet(
    "General follow-up. Best move: acknowledge context already captured and ask the single next-most-useful question.",
    signals.detectedSignals,
    [
      buildSuggestion(
        "balanced",
        "Balanced",
        `Happy to help you narrow this down.${context.length > 0 ? ` I have ${context}.` : ""} What are you hoping to solve first — pricing, timing, or the right area?`,
      ),
      buildSuggestion(
        "warmer",
        "Warmer",
        `Absolutely. I can keep this simple and help you get to the next useful answer fast.${context.length > 0 ? ` I already have ${context}.` : ""} What do you want to figure out first?`,
      ),
      buildSuggestion(
        "direct",
        "Direct",
        `${context.length > 0 ? `I have ${context}. ` : ""}What should I solve first — budget, timing, area, or next steps?`,
      ),
    ],
  );
}

export function draftConversationSandboxReplySet(thread: ConversationInboxThread): SandboxReplySet {
  const signals = readSignals(thread);

  if (signals.humanReview) {
    return buildHumanReviewReplySet(thread, signals);
  }
  if (signals.trustConcern) {
    return buildTrustReplySet(thread, signals);
  }
  if (signals.blueprintRequest) {
    return buildBlueprintReplySet(signals);
  }
  if (signals.showingRequest || (signals.askedForPhone && signals.phone !== null)) {
    return buildShowingReplySet(thread, signals);
  }
  if (signals.financingQuestion || signals.notPreapproved) {
    return buildFinancingReplySet(thread, signals);
  }
  if (signals.browsing) {
    return buildBrowsingReplySet(signals);
  }
  if (signals.greeting) {
    return buildGreetingReplySet(thread, signals);
  }
  if (signals.relocation) {
    return buildRelocationReplySet(thread, signals);
  }
  if (signals.listingQuestion) {
    return buildListingReplySet(thread, signals);
  }
  return buildGeneralReplySet(thread, signals);
}

export function draftConversationSandboxReply(thread: ConversationInboxThread): string {
  return draftConversationSandboxReplySet(thread).primary.reply;
}
