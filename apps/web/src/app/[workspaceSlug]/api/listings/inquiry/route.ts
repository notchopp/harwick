import { PublicListingInquiryRequestSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * POST /[workspaceSlug]/api/listings/inquiry
 * Public endpoint for listing inquiry form submissions.
 * Creates or updates a lead from public listing surface.
 */
export async function POST(
  request: NextRequest,
  props: {
    params: Promise<{
      workspaceSlug: string;
    }>;
  }
) {
  const { workspaceSlug } = await props.params;
  const supabase = createServerSupabaseClient();

  try {
    // Parse and validate request body
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = await request.json();
    const listingId = request.nextUrl.searchParams.get("listingId");
    
    if (!listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 }
      );
    }

    const validatedInput = PublicListingInquiryRequestSchema.safeParse(body);
    if (!validatedInput.success) {
      return NextResponse.json(
        { error: "invalid_request", details: validatedInput.error.flatten() },
        { status: 400 }
      );
    }

    // Resolve workspace by slug
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", workspaceSlug)
      .maybeSingle();

    if (workspaceError) {
      console.error("Workspace lookup error:", workspaceError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!workspace) {
      return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
    }

    const workspaceId = workspace.id;

    // Look up listing to validate it exists and get its address
    const { data: listing, error: listingError } = await supabase
      .from("listing_facts")
      .select("id, address, workspace_id")
      .eq("id", listingId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (listingError) {
      console.error("Listing lookup error:", listingError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!listing) {
      return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    }

    // Create or update lead from inquiry
    // First, try to find existing lead by phone or email
    const { data: existingLead, error: leadLookupError } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .or(
        `email.eq.${validatedInput.data.email},phone.eq.${validatedInput.data.phone}`
      )
      .limit(1)
      .maybeSingle();

    if (leadLookupError) {
      console.error("Lead lookup error:", leadLookupError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    let leadId: string;

    if (existingLead) {
      // Update existing lead
      leadId = existingLead.id;
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          full_name: validatedInput.data.fullName,
          email: validatedInput.data.email,
          phone: validatedInput.data.phone,
          timeline: validatedInput.data.timeline ?? null,
          budget_min: validatedInput.data.budget ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (updateError) {
        console.error("Lead update error:", updateError);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    }else {
      // Create new lead
      const { data: newLead, error: createError } = await supabase
        .from("leads")
        .insert([
          {
            workspace_id: workspaceId,
            full_name: validatedInput.data.fullName,
            email: validatedInput.data.email,
            phone: validatedInput.data.phone,
            lead_type: "unknown" as const,
            intent: "unknown" as const,
            source_channel: "manual" as const,
            financing_status: "unknown" as const,
            timeline: validatedInput.data.timeline ?? null,
            budget_min: validatedInput.data.budget ?? null,
            budget_max: null,
            status: "new" as const,
            score: 0,
            source_provider_id: null,
            source_post_id: null,
            source_comment_id: null,
            instagram_user_id: null,
            instagram_username: null,
            target_area: null,
            assigned_agent_id: null,
            follow_up_boss_contact_id: null,
            last_message_at: null,
            next_followup_at: null,
          },
        ])
        .select("id")
        .single();

      if (createError) {
        console.error("Lead create error:", createError);
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      if (!newLead) {
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }

      leadId = newLead.id;
    }

    // Record lead event for the inquiry
    const { error: eventError } = await supabase
      .from("lead_events")
      .insert([
        {
          workspace_id: workspaceId,
          lead_id: leadId,
          provider: "manual" as const,
          event_type: "message_received" as const,
          source_channel: "manual" as const,
          provider_event_id: `inquiry_${Date.now()}`,
          provider_account_id: null,
          provider_user_id: null,
          source_post_id: null,
          source_comment_id: null,
          text: validatedInput.data.message || `Interested in listing at ${listing.address}`,
          occurred_at: new Date().toISOString(),
        },
      ]);

    if (eventError) {
      console.error("Lead event creation error:", eventError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, leadId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Listing inquiry error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
