import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ocuaacjexbnjukzkjnpl.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jdWFhY2pleGJuanVremtqbnBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzA1MjIxNSwiZXhwIjoyMDkyNjI4MjE1fQ.xALLbL1lS0R-6rQMIEGkBomZZB8eshc6ASxUG0QHGQw";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const leadId = "13d57e3b-f996-4940-895b-0668c41aae37";
  const eventId = "cbc5f727-9775-432f-b8a6-2583e3066434";

  const { data: lead, error: leadError } = await supabase.from("leads").select("*").eq("id", leadId).single();
  console.log("Lead:", lead ? `✓ ${lead.instagram_username} (last_message_at: ${lead.last_message_at})` : "NOT FOUND");
  if (leadError) console.log("Lead error:", leadError.message);

  const { data: event, error: eventError } = await supabase.from("lead_events").select("*").eq("id", eventId).single();
  console.log("Event:", event ? `✓ Event exists` : "NOT FOUND");
  if (eventError) console.log("Event error:", eventError.message);
}

check();
