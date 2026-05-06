import { z } from "zod";

const RETELL_API_BASE_URL = "https://api.retellai.com";

export const RealtyRetellProvisioningConfigSchema = z.object({
  workspaceId: z.string().uuid(),
  workspaceName: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(80).default("America/New_York"),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).default([]),
  transferNumber: z.string().trim().min(1).max(32).nullable().default(null),
  templateFlowId: z.string().trim().min(1).optional(),
  voiceId: z.string().trim().min(1),
  voiceWebhookBaseUrl: z.string().trim().url(),
  dynamicVariablesBaseUrl: z.string().trim().url(),
});

export const RetellProvisionedAssetSchema = z.object({
  conversationFlowId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  retellPhoneNumberId: z.string().trim().min(1).nullable(),
  phoneNumber: z.string().trim().min(1).nullable(),
  created: z.boolean(),
});

const RetellConversationFlowResponseSchema = z.object({
  conversation_flow_id: z.string().trim().min(1).optional(),
  version: z.number().optional(),
}).passthrough();

const RetellAgentResponseSchema = z.object({
  agent_id: z.string().trim().min(1),
}).passthrough();

const RetellPhoneNumberResponseSchema = z.object({
  phone_number: z.string().trim().min(1),
}).passthrough();

export type RealtyRetellProvisioningConfig = z.infer<typeof RealtyRetellProvisioningConfigSchema>;
export type RetellProvisionedAsset = z.infer<typeof RetellProvisionedAssetSchema>;

export type RetellProvisioningClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export type ProvisionRealtyRetellAgentInput = {
  config: RealtyRetellProvisioningConfig;
  existingRetellAgentId?: string | null;
  existingRetellConversationFlowId?: string | null;
  existingPhoneNumber?: string | null;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildServiceAreaSummary(serviceAreas: readonly string[]): string {
  if (serviceAreas.length === 0) {
    return "Ask for the buyer or seller's target area.";
  }

  return serviceAreas.join(", ");
}

function toNodeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeEdge(id: string, prompt: string, destinationNodeId: string): Record<string, unknown> {
  return {
    id,
    transition_condition: {
      type: "prompt",
      prompt,
    },
    destination_node_id: destinationNodeId,
  };
}

export function buildRealtyRetellGlobalPrompt(): string {
  return `You are the front-desk voice assistant for {{workspace_name}}. Your job is to turn inbound real estate calls into clean, actionable lead handoffs.

You sound like a real person who works the front desk for a high-performing real estate team. Not a chatbot. Not a script reader. You keep the call moving without making the caller feel processed.

Timezone: {{timezone}}
Service areas: {{service_areas}}

## How You Talk
Your rhythm on every call: acknowledge -> understand -> gather -> guide -> confirm next step.

Rules:
- 1-2 sentences per turn. One question at a time. Let them talk.
- Never rapid-fire questions.
- Acknowledge what they share before moving on.
- Match their energy. Busy agent or vendor: be efficient. Nervous buyer or seller: slow down.
- Do not say tool names out loud.
- Do not say you created a handoff, transfer, callback, or note unless the tool result confirms it.
- If a tool fails, say that clearly and keep the caller focused on the next best contact step.
- Before a handoff or transfer, summarize the caller's need in one short staff-facing sentence.

## This Caller
Name: {{caller_name}}
Lead type: {{lead_type}}
Target area: {{target_area}}
Timeline: {{timeline}}
Budget or sale price: {{budget}}
Financing status: {{financing_status}}
Memory: {{memory_summary}}
Next action: {{next_action}}

## Opening
Use this opening when provided by live context:
{{realty_opening_text}}

If that is empty, say: Thanks for calling {{workspace_name}}. Are you looking to buy, sell, rent, or ask about a specific home?

Qualify the caller by identifying:
- whether they are buying, selling, renting, investing, or asking about a specific listing
- their target area
- their timeline
- their budget or expected sale price
- whether they are preapproved, cash, or need a lender introduction
- the best callback number and next step

## Listing Rules
- Never guess listing status, availability, price, pool, HOA, school zone, or sold status.
- Use lookup_listing for listing-specific questions.
- If lookup_listing says data is not live or not verified, tell the caller the team will verify current details and follow up.

## Legal, Lending, and Contract Rules
Never claim legal, lending, mortgage, contract, tax, or financial certainty. If the caller needs advice in those areas, offer to have a licensed human follow up.

## Tool Rules
- Use create_lead_handoff once you have enough detail to create a useful handoff.
- Use transfer_call when the caller asks for a person, sounds hot, requests a showing, wants a valuation, or the next step needs a human.
- Use lookup_listing for listing facts and only trust the tool result.
- Use end_call only after the caller's next step is clear.
- Include workspace_id={{workspace_id}} and from_number={{from_number}} when a tool has those fields available.

If the caller is hot, urgent, asks for a showing, wants a valuation, says they are preapproved, or asks to talk to an agent, prepare a concise handoff and transfer or create the callback action.`;
}

export function buildRealtyRetellDefaultVariables(
  config: RealtyRetellProvisioningConfig,
): Record<string, string> {
  return {
    workspace_id: config.workspaceId,
    workspace_name: config.workspaceName,
    timezone: config.timezone,
    service_areas: buildServiceAreaSummary(config.serviceAreas),
    transfer_number: config.transferNumber ?? "",
    caller_name: "",
    lead_type: "unknown",
    target_area: "",
    timeline: "",
    budget: "",
    financing_status: "unknown",
    from_number: "",
    to_number: "",
    memory_summary: "No prior lead history loaded yet.",
    next_action: "Listen first, identify the real estate intent, then qualify naturally.",
  };
}

export function buildRealtyRetellPostCallAnalysisData() {
  return [
    { type: "string", name: "call_summary", description: "2-3 sentence summary of the real estate lead call" },
    { name: "lead_type", type: "enum", choices: ["buyer", "seller", "renter", "investor", "unknown"], description: "Primary lead category" },
    { name: "intent", type: "enum", choices: ["high", "medium", "low", "spam", "unknown"], description: "Lead intent strength" },
    { type: "string", name: "target_area", description: "City, neighborhood, ZIP, or area requested" },
    { type: "string", name: "timeline", description: "Buying, selling, renting, or showing timeline" },
    { type: "string", name: "budget", description: "Budget or expected sale price if mentioned" },
    { name: "financing_status", type: "enum", choices: ["preapproved", "cash", "needs_lender", "unknown"], description: "Financing or preapproval status" },
    { name: "call_outcome", type: "enum", choices: ["showing_requested", "valuation_requested", "callback_requested", "qualified", "nurture", "spam", "no_resolution"], description: "Operational outcome" },
    { type: "string", name: "caller_name", description: "Caller name if provided" },
  ];
}

type RealtyConversationFlowToolDefinition = {
  tool_id: string;
  execution_message_description: string;
  speak_after_execution: boolean;
  name: string;
  description: string;
  type: "custom";
  speak_during_execution: boolean;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  url: string;
};

function buildRealtyToolDefinitions(config: RealtyRetellProvisioningConfig): RealtyConversationFlowToolDefinition[] {
  const toolUrl = `${trimTrailingSlash(config.voiceWebhookBaseUrl)}/api/retell/tools`;

  return [
    {
      tool_id: "create_lead_handoff",
      execution_message_description: "Capturing the lead handoff now...",
      speak_after_execution: true,
      name: "create_lead_handoff",
      description: "Create a clean lead handoff when the caller has shared enough real estate qualification detail.",
      type: "custom",
      speak_during_execution: true,
      parameters: {
        type: "object",
        properties: {
          caller_name: { type: "string" },
          phone_number: { type: "string" },
          lead_type: { type: "string", enum: ["buyer", "seller", "renter", "investor", "unknown"] },
          target_area: { type: "string" },
          timeline: { type: "string" },
          budget: { type: "string" },
          financing_status: { type: "string", enum: ["preapproved", "cash", "needs_lender", "unknown"] },
          urgency: { type: "string", enum: ["routine", "hot", "needs_handoff"] },
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      url: toolUrl,
    },
    {
      tool_id: "lookup_listing",
      execution_message_description: "Checking the listing details now...",
      speak_after_execution: true,
      name: "lookup_listing",
      description: "Look up listing facts before answering listing-specific questions.",
      type: "custom",
      speak_during_execution: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mls_number: { type: "string" },
          address: { type: "string" },
          question: { type: "string" },
        },
        required: ["query"],
      },
      url: toolUrl,
    },
    {
      tool_id: "transfer_call",
      execution_message_description: "Connecting the call now...",
      speak_after_execution: true,
      name: "transfer_call",
      description: "Transfer the caller to a human when the lead is hot, asks for a person, or needs live help.",
      type: "custom",
      speak_during_execution: true,
      parameters: {
        type: "object",
        properties: {
          transfer_to: { type: "string" },
          reason: { type: "string" },
          summary: { type: "string" },
        },
        required: ["reason"],
      },
      url: toolUrl,
    },
    {
      tool_id: "end_call",
      execution_message_description: "Ending the call now...",
      speak_after_execution: true,
      name: "end_call",
      description: "End the call after the next step is clear.",
      type: "custom",
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
      url: toolUrl,
    },
  ];
}

function mergeRealtyConversationFlowTools(params: {
  config: RealtyRetellProvisioningConfig;
  existingTools: unknown;
}): RealtyConversationFlowToolDefinition[] {
  const realtyTools = buildRealtyToolDefinitions(params.config);
  const realtyToolNames = new Set(realtyTools.map((tool) => tool.name));
  const existingTools = Array.isArray(params.existingTools)
    ? params.existingTools.flatMap((tool) => {
        if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
          return [];
        }

        const record = tool as Record<string, unknown>;
        return typeof record["name"] === "string" && !realtyToolNames.has(record["name"])
          ? [record as unknown as RealtyConversationFlowToolDefinition]
          : [];
      })
    : [];

  return [...realtyTools, ...existingTools];
}

function createActionFunctionNode(params: {
  sourceNodeId: string;
  sourceNodeName: string;
  toolName: "create_lead_handoff" | "transfer_call" | "end_call";
  instruction: string;
  successDestinationNodeId: string;
  failureDestinationNodeId: string;
  displayX: number;
  displayY: number;
}): Record<string, unknown> {
  return {
    id: `${params.sourceNodeId}-action-${toNodeId(params.toolName)}`,
    name: `${params.sourceNodeName} - ${params.toolName}`,
    type: "function",
    tool_id: params.toolName,
    tool_type: "local",
    wait_for_result: true,
    speak_during_execution: true,
    instruction: {
      type: "prompt",
      text: params.instruction,
    },
    edges: [
      makeEdge(
        `edge-${toNodeId(params.sourceNodeId)}-${toNodeId(params.toolName)}-success`,
        "The tool result confirms the requested action completed successfully and the caller can move to the next step.",
        params.successDestinationNodeId,
      ),
    ],
    else_edge: {
      id: `edge-${toNodeId(params.sourceNodeId)}-${toNodeId(params.toolName)}-else`,
      transition_condition: {
        type: "prompt",
        prompt: "Else",
      },
      destination_node_id: params.failureDestinationNodeId,
    },
    display_position: { x: params.displayX, y: params.displayY },
  };
}

export function buildRealtyConversationFlowNodes(): {
  nodes: Array<Record<string, unknown>>;
  startNodeId: string;
} {
  const startNodeId = "realty-start";
  const buyerNodeId = "realty-buyer-qualification";
  const sellerNodeId = "realty-seller-qualification";
  const listingNodeId = "realty-listing-question";
  const supportNodeId = "realty-general-support";
  const handoffNodeId = "realty-handoff";
  const closingNodeId = "realty-closing";
  const endNodeId = "realty-end";

  const nodes: Array<Record<string, unknown>> = [
    {
      id: startNodeId,
      name: "Greet & Identify Intent",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Use {{realty_opening_text}} if present. Otherwise greet the caller for {{workspace_name}} and ask whether they are buying, selling, renting, or calling about a specific home.",
          "Listen first. Ask one question at a time. Do not repeat the greeting.",
          "If caller context is present, acknowledge it naturally without exposing internal fields.",
        ].join("\n"),
      },
      edges: [
        makeEdge("edge-start-buyer", "The caller wants to buy, tour, invest, rent, or find a home.", buyerNodeId),
        makeEdge("edge-start-seller", "The caller wants to sell, get a valuation, discuss listing their home, or asks what their home is worth.", sellerNodeId),
        makeEdge("edge-start-listing", "The caller asks about a specific address, listing, MLS number, property feature, showing, availability, or sold status.", listingNodeId),
        makeEdge("edge-start-support", "The caller has a general question, vendor request, recruiting question, wrong number, or no real estate path is clear yet.", supportNodeId),
      ],
      display_position: { x: 0, y: 0 },
    },
    {
      id: buyerNodeId,
      name: "Buyer Qualification",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Qualify a buyer, renter, or investor lead for {{workspace_name}}.",
          "Get target area, timeline, budget, financing status, and whether they want a showing or lender introduction.",
          "If the caller is hot, preapproved, cash, wants a showing, or asks for an agent, move to handoff.",
          "If a specific listing question comes up, use lookup_listing before answering.",
        ].join("\n"),
      },
      tool_ids: ["lookup_listing"],
      edges: [
        makeEdge("edge-buyer-handoff", "The caller is qualified enough for a useful handoff, requests a showing, asks for an agent, or has urgent buying intent.", handoffNodeId),
        makeEdge("edge-buyer-close", "The caller has shared enough detail and the next step is clear without a live transfer.", closingNodeId),
        makeEdge("edge-buyer-support", "The caller shifts into a general question or no longer fits the buyer path.", supportNodeId),
      ],
      display_position: { x: 340, y: -220 },
    },
    {
      id: sellerNodeId,
      name: "Seller Qualification",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Qualify a seller lead for {{workspace_name}}.",
          "Get property area, timeline, selling motivation, expected price if offered, and whether they want a valuation or listing consult.",
          "Do not promise valuation certainty. Offer a licensed human follow-up for pricing, contracts, and strategy.",
          "If the caller wants a valuation, listing consult, or agent conversation, move to handoff.",
        ].join("\n"),
      },
      edges: [
        makeEdge("edge-seller-handoff", "The caller wants a valuation, listing consult, pricing guidance, or asks to speak with an agent.", handoffNodeId),
        makeEdge("edge-seller-close", "The caller has shared enough seller detail and the next step is clear without a live transfer.", closingNodeId),
        makeEdge("edge-seller-support", "The caller shifts into a general question or no longer fits the seller path.", supportNodeId),
      ],
      display_position: { x: 340, y: 40 },
    },
    {
      id: listingNodeId,
      name: "Listing Question",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Handle listing-specific questions only with verified tool results.",
          "Use lookup_listing for status, price, pool, HOA, school, sold status, availability, or showing questions.",
          "If the tool cannot verify the answer, say the team will verify current details and follow up.",
          "If the caller wants a tour or agent, move to handoff.",
        ].join("\n"),
      },
      tool_ids: ["lookup_listing"],
      edges: [
        makeEdge("edge-listing-handoff", "The caller wants a showing, asks to speak with an agent, or needs verified listing follow-up.", handoffNodeId),
        makeEdge("edge-listing-buyer", "The listing question turns into buyer qualification.", buyerNodeId),
        makeEdge("edge-listing-close", "The listing answer was handled and the caller has a clear next step.", closingNodeId),
      ],
      display_position: { x: 340, y: 300 },
    },
    {
      id: supportNodeId,
      name: "General Support",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Answer general questions briefly using live context and the global rules.",
          "Do not guess listing facts. Use lookup_listing when property facts are requested.",
          "If the caller needs the real estate team, move to handoff.",
          "If the call is spam, wrong number, or done, move to closing.",
        ].join("\n"),
      },
      tool_ids: ["lookup_listing"],
      edges: [
        makeEdge("edge-support-handoff", "The caller needs staff follow-up, asks for a person, or becomes a qualified real estate lead.", handoffNodeId),
        makeEdge("edge-support-close", "The caller has their answer, is a wrong number, is spam, or the next step is clear.", closingNodeId),
      ],
      display_position: { x: 340, y: 560 },
    },
    {
      id: handoffNodeId,
      name: "Create Handoff",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Before acting, summarize the caller's need in one short staff-facing sentence.",
          "Confirm the best callback number if it is missing or uncertain.",
          "Create the lead handoff once the summary is useful. If live help is needed, transfer after the handoff succeeds.",
          "Never say the handoff or transfer happened unless the tool result confirms it.",
        ].join("\n"),
      },
      edges: [
        makeEdge("edge-handoff-create", "The caller details are sufficient and the lead handoff should be created now.", "realty-handoff-action-create-lead-handoff"),
        makeEdge("edge-handoff-transfer", "A handoff already exists and the caller needs a live agent now.", "realty-handoff-action-transfer-call"),
        makeEdge("edge-handoff-close", "The caller declines live transfer and the callback or next step is already clear.", closingNodeId),
      ],
      display_position: { x: 700, y: 40 },
    },
    createActionFunctionNode({
      sourceNodeId: handoffNodeId,
      sourceNodeName: "Create Handoff",
      toolName: "create_lead_handoff",
      instruction: "Create the lead handoff now using the caller's known real estate details. Only move on once the tool result is available.",
      successDestinationNodeId: closingNodeId,
      failureDestinationNodeId: supportNodeId,
      displayX: 980,
      displayY: -70,
    }),
    createActionFunctionNode({
      sourceNodeId: handoffNodeId,
      sourceNodeName: "Create Handoff",
      toolName: "transfer_call",
      instruction: "Transfer the call now only after the lead context is summarized and live help is clearly needed. Only move on once the tool result is available.",
      successDestinationNodeId: closingNodeId,
      failureDestinationNodeId: supportNodeId,
      displayX: 980,
      displayY: 90,
    }),
    {
      id: closingNodeId,
      name: "Closing",
      type: "conversation",
      instruction: {
        type: "prompt",
        text: [
          "Wrap up warmly and state only what actually happened.",
          "If the caller asks another question, move back to support.",
          "If a handoff or transfer was promised but has not succeeded, do not end. Go back to handoff or support.",
          "Ask if there is anything else. If not, end the call.",
        ].join("\n"),
      },
      edges: [
        makeEdge("edge-close-support", "The caller has another question, new request, or needs more clarification.", supportNodeId),
        makeEdge("edge-close-end", "The caller confirms they are done, says goodbye, or there is nothing else to help with.", endNodeId),
      ],
      display_position: { x: 1260, y: 220 },
    },
    {
      id: endNodeId,
      name: "End Call",
      type: "end",
      instruction: {
        type: "prompt",
        text: "End the call warmly once the caller is done.",
      },
      speak_during_execution: true,
      display_position: { x: 1580, y: 220 },
    },
  ];

  return {
    nodes,
    startNodeId,
  };
}

function buildRetellAgentBody(params: {
  config: RealtyRetellProvisioningConfig;
  conversationFlowId: string;
}) {
  return {
    agent_name: `Realty Ops - ${params.config.workspaceName}`,
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: params.conversationFlowId,
    },
    voice_id: params.config.voiceId,
    language: "en-US",
    voice_speed: 1.05,
    voice_temperature: 0.35,
    enable_dynamic_voice_speed: true,
    responsiveness: 0.65,
    enable_dynamic_responsiveness: true,
    interruption_sensitivity: 0.62,
    enable_backchannel: false,
    max_call_duration_ms: 600_000,
    normalize_for_speech: true,
    stt_mode: "accurate",
    webhook_url: `${trimTrailingSlash(params.config.voiceWebhookBaseUrl)}/api/retell/webhook`,
    webhook_events: ["call_started", "call_ended", "call_analyzed"],
    dynamic_variables_webhook_url: `${trimTrailingSlash(params.config.dynamicVariablesBaseUrl)}/api/retell/context`,
    post_call_analysis_model: "gpt-4.1-mini",
    post_call_analysis_data: buildRealtyRetellPostCallAnalysisData(),
  };
}

function buildRetellPhoneNumberBody(params: {
  config: RealtyRetellProvisioningConfig;
  agentId: string;
}): Record<string, unknown> {
  return {
    inbound_agent_id: params.agentId,
    outbound_agent_id: params.agentId,
    nickname: `Realty Ops - ${params.config.workspaceName}`,
    number_provider: "twilio",
    country_code: "US",
    allowed_inbound_country_list: ["US", "CA"],
    allowed_outbound_country_list: ["US", "CA"],
  };
}

function stripRetellOwnedFlowFields(flow: Record<string, unknown>): Record<string, unknown> {
  const {
    conversation_flow_id,
    version,
    is_published,
    kb_config,
    begin_tag_display_position,
    ...body
  } = flow;

  void conversation_flow_id;
  void version;
  void is_published;
  void kb_config;
  void begin_tag_display_position;

  return body;
}

export function buildRealtyConversationFlowBody(params: {
  templateFlow: Record<string, unknown>;
  config: RealtyRetellProvisioningConfig;
}): Record<string, unknown> {
  const body = stripRetellOwnedFlowFields(params.templateFlow);
  body["global_prompt"] = buildRealtyRetellGlobalPrompt();
  body["default_dynamic_variables"] = buildRealtyRetellDefaultVariables(params.config);
  body["tools"] = mergeRealtyConversationFlowTools({
    config: params.config,
    existingTools: params.templateFlow["tools"],
  });
  const compiledFlow = buildRealtyConversationFlowNodes();
  body["nodes"] = compiledFlow.nodes;
  body["start_node_id"] = compiledFlow.startNodeId;
  return body;
}

export function createRetellProvisioningClient(options: RetellProvisioningClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(`${RETELL_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Retell API ${path} failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  return {
    async getConversationFlow(conversationFlowId: string): Promise<Record<string, unknown>> {
      const response = await request(`/get-conversation-flow/${conversationFlowId}`);
      return RetellConversationFlowResponseSchema.parse(response);
    },

    async createConversationFlow(body: Record<string, unknown>): Promise<string> {
      const response = await request("/create-conversation-flow", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return RetellConversationFlowResponseSchema.parse(response).conversation_flow_id ?? "";
    },

    async updateConversationFlow(params: {
      conversationFlowId: string;
      body: Record<string, unknown>;
      version?: number;
    }): Promise<void> {
      const path = typeof params.version === "number"
        ? `/update-conversation-flow/${params.conversationFlowId}?version=${params.version}`
        : `/update-conversation-flow/${params.conversationFlowId}`;

      await request(path, {
        method: "PATCH",
        body: JSON.stringify(params.body),
      });
    },

    async createAgent(params: {
      config: RealtyRetellProvisioningConfig;
      conversationFlowId: string;
    }): Promise<string> {
      const response = await request("/create-agent", {
        method: "POST",
        body: JSON.stringify(buildRetellAgentBody(params)),
      });
      return RetellAgentResponseSchema.parse(response).agent_id;
    },

    async updateAgent(params: {
      config: RealtyRetellProvisioningConfig;
      agentId: string;
      conversationFlowId: string;
    }): Promise<void> {
      await request(`/update-agent/${params.agentId}`, {
        method: "PATCH",
        body: JSON.stringify(buildRetellAgentBody({
          config: params.config,
          conversationFlowId: params.conversationFlowId,
        })),
      });
    },

    async createPhoneNumber(params: {
      config: RealtyRetellProvisioningConfig;
      agentId: string;
    }): Promise<string> {
      const response = await request("/create-phone-number", {
        method: "POST",
        body: JSON.stringify(buildRetellPhoneNumberBody(params)),
      });
      return RetellPhoneNumberResponseSchema.parse(response).phone_number;
    },

    async updatePhoneNumber(params: {
      config: RealtyRetellProvisioningConfig;
      agentId: string;
      phoneNumber: string;
    }): Promise<string> {
      const response = await request(`/update-phone-number/${encodeURIComponent(params.phoneNumber)}`, {
        method: "PATCH",
        body: JSON.stringify(buildRetellPhoneNumberBody(params)),
      });
      return RetellPhoneNumberResponseSchema.parse(response).phone_number;
    },
  };
}

export async function provisionRealtyRetellAgent(params: ProvisionRealtyRetellAgentInput & {
  client: ReturnType<typeof createRetellProvisioningClient>;
}): Promise<RetellProvisionedAsset> {
  const config = RealtyRetellProvisioningConfigSchema.parse(params.config);

  if (params.existingRetellAgentId && params.existingRetellConversationFlowId) {
    const existingFlow = await params.client.getConversationFlow(params.existingRetellConversationFlowId);
    const updateParams: {
      conversationFlowId: string;
      body: Record<string, unknown>;
      version?: number;
    } = {
      conversationFlowId: params.existingRetellConversationFlowId,
      body: buildRealtyConversationFlowBody({
        templateFlow: existingFlow,
        config,
      }),
    };
    if (typeof existingFlow["version"] === "number") {
      updateParams.version = existingFlow["version"];
    }

    await params.client.updateConversationFlow(updateParams);
    await params.client.updateAgent({
      config,
      agentId: params.existingRetellAgentId,
      conversationFlowId: params.existingRetellConversationFlowId,
    });
    const phoneNumber = params.existingPhoneNumber
      ? await params.client.updatePhoneNumber({
          config,
          agentId: params.existingRetellAgentId,
          phoneNumber: params.existingPhoneNumber,
        })
      : await params.client.createPhoneNumber({
          config,
          agentId: params.existingRetellAgentId,
        });

    return RetellProvisionedAssetSchema.parse({
      conversationFlowId: params.existingRetellConversationFlowId,
      agentId: params.existingRetellAgentId,
      retellPhoneNumberId: phoneNumber,
      phoneNumber,
      created: false,
    });
  }

  const templateFlow = config.templateFlowId === undefined
    ? {}
    : await params.client.getConversationFlow(config.templateFlowId);
  const conversationFlowId = await params.client.createConversationFlow(
    buildRealtyConversationFlowBody({
      templateFlow,
      config,
    }),
  );

  if (conversationFlowId.length === 0) {
    throw new Error("Retell did not return a conversation_flow_id.");
  }

  const agentId = await params.client.createAgent({
    config,
    conversationFlowId,
  });
  const phoneNumber = await params.client.createPhoneNumber({
    config,
    agentId,
  });

  return RetellProvisionedAssetSchema.parse({
    conversationFlowId,
    agentId,
    retellPhoneNumberId: phoneNumber,
    phoneNumber,
    created: true,
  });
}
