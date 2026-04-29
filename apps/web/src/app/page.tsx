import { DashboardPage } from "../features/dashboard/dashboard-page";
import { loadDashboardData } from "../features/dashboard/live-dashboard-data";
import { createServerSupabaseClient } from "../lib/supabase/server-client";

export default async function HomePage() {
  const liveData = await loadDashboardData(createServerSupabaseClient());

  return (
    <DashboardPage
      liveLeads={liveData.leads}
      liveMetrics={liveData.metrics}
      livePipelineStages={liveData.pipelineStages}
    />
  );
}
