"use client";

import { useState } from "react";

import { Button } from "../../components/ui/button";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";

function ToggleRow(props: {
  checked: boolean;
  description: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border py-3 last:border-b-0 last:pb-0">
      <div className="flex-1">
        <div className="text-[13px] font-medium text-foreground">{props.label}</div>
        <div className="mt-1 text-[11.5px] text-muted-subtle">{props.description}</div>
      </div>
      <button
        aria-checked={props.checked}
        className={cn(
          "relative h-[23px] w-[41px] shrink-0 rounded-full border transition-all shadow-[inset_0_1px_2px_rgba(31,42,34,0.16)]",
          props.checked ? "border-qualified/30 bg-qualified" : "border-border bg-[#E8E5DF]",
        )}
        onClick={props.onToggle}
        role="switch"
        type="button"
      >
        <span
          className={cn(
            "absolute top-[3px] h-[15px] w-[15px] rounded-full bg-white shadow-[0_3px_8px_rgba(31,42,34,0.24)] transition-transform",
            props.checked ? "translate-x-[21px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

function SettingsSection(props: { children: React.ReactNode; title: string; danger?: boolean }) {
  return (
    <section
      className={cn(
        "harwick-card px-[18px] py-[18px]",
        props.danger && "border-oxblood-soft",
      )}
    >
      <div className={cn("mb-[14px] font-display text-[15px] font-medium", props.danger && "text-hot")}>
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="mb-[7px] flex gap-2 text-[12.5px] last:mb-0">
      <span className="w-[68px] shrink-0 text-muted-subtle">{props.label}</span>
      <span className="font-medium text-foreground">{props.value}</span>
    </div>
  );
}

export function SettingsPageContent(props: { workspaceName: string }) {
  const [notifications, setNotifications] = useState({
    newLeadAssigned: true,
    replyApprovalNeeded: true,
    missedCallAlerts: true,
    fubSyncErrors: false,
    dailyDigest: false,
  });
  const [preferences, setPreferences] = useState({
    autoSendActions: false,
    transferQualifiedCalls: true,
  });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context="profile & settings" workspaceName={props.workspaceName}>
        <Button className="ml-auto px-4 text-[11px]" size="sm" type="button">
          Save Changes
        </Button>
      </WorkspaceTopbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="grid items-start gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
          <div>
            <div className="harwick-card mb-[14px] p-[22px] text-center">
              <div className="mx-auto mb-3 flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#c9a84c,#8b5e1a)] font-display text-[30px] font-medium text-white">
                SK
              </div>
              <div className="font-display text-[21px] font-medium">Sarah Kim</div>
              <div className="mb-[14px] text-[12px] text-muted-subtle">Agent · Prestige Realty</div>

              <div className="mb-[13px] border-y border-border py-[13px]">
                <div className="flex justify-center gap-[18px]">
                  <div className="text-center">
                    <div className="font-display text-[21px] font-medium">89</div>
                    <div className="mt-px text-[10px] text-muted-subtle">Leads</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-[21px] font-medium">64%</div>
                    <div className="mt-px text-[10px] text-muted-subtle">Qual rate</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-[21px] font-medium">4.8</div>
                    <div className="mt-px text-[10px] text-muted-subtle">Avg score</div>
                  </div>
                </div>
              </div>

              <Button
                className="w-full text-[12px]"
                size="sm"
                type="button"
                variant="outline"
              >
                Change Photo
              </Button>
            </div>

            <div className="harwick-card p-[18px]">
              <div className="mb-[13px] font-display text-[16px] font-medium">Workspace</div>
              <InfoRow label="Name" value="Prestige Realty" />
              <InfoRow label="Plan" value="Team" />
              <InfoRow label="Members" value="4 agents" />
              <InfoRow label="Phone" value="(305) 555-0192" />
              <div className="mt-[11px]">
                <Button
                  className="text-[11px]"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Workspace Settings
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-[13px]">
            <SettingsSection title="Personal Info">
              <div className="space-y-0">
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Full Name</div>
                  <input className="harwick-control w-[190px] px-[11px] py-[7px] text-[12.5px]" defaultValue="Sarah Kim" />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Email</div>
                  <input className="harwick-control w-[220px] px-[11px] py-[7px] text-[12.5px]" defaultValue="sarah@prestigerealty.com" />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Phone</div>
                  <input className="harwick-control w-[155px] px-[11px] py-[7px] text-[12.5px]" defaultValue="(305) 555-8844" />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Role</div>
                  <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                    <option>Agent</option>
                    <option>Team Lead</option>
                    <option>Broker / Owner</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 py-3">
                  <div className="flex-1 text-[13px] font-medium">Specialization</div>
                  <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                    <option>Residential</option>
                    <option>Commercial</option>
                    <option selected>Luxury</option>
                    <option>Investment</option>
                    <option>Rental</option>
                  </select>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Notifications">
              <ToggleRow
                checked={notifications.newLeadAssigned}
                description="Alert when a lead is assigned to you"
                label="New lead assigned"
                onToggle={() => setNotifications((current) => ({ ...current, newLeadAssigned: !current.newLeadAssigned }))}
              />
              <ToggleRow
                checked={notifications.replyApprovalNeeded}
                description="Harwick actions waiting on your approval"
                label="Reply approval needed"
                onToggle={() => setNotifications((current) => ({ ...current, replyApprovalNeeded: !current.replyApprovalNeeded }))}
              />
              <ToggleRow
                checked={notifications.missedCallAlerts}
                description="Immediate alert when a call is missed"
                label="Missed call alerts"
                onToggle={() => setNotifications((current) => ({ ...current, missedCallAlerts: !current.missedCallAlerts }))}
              />
              <ToggleRow
                checked={notifications.fubSyncErrors}
                description="Alert on sync failures or conflicts"
                label="FUB sync errors"
                onToggle={() => setNotifications((current) => ({ ...current, fubSyncErrors: !current.fubSyncErrors }))}
              />
              <ToggleRow
                checked={notifications.dailyDigest}
                description="Morning summary of yesterday's activity"
                label="Daily digest"
                onToggle={() => setNotifications((current) => ({ ...current, dailyDigest: !current.dailyDigest }))}
              />
            </SettingsSection>

            <SettingsSection title="Reply Preferences">
              <ToggleRow
                checked={preferences.autoSendActions}
                description="Send Harwick actions automatically if confidence is high"
                label="Auto-send approved actions"
                onToggle={() => setPreferences((current) => ({ ...current, autoSendActions: !current.autoSendActions }))}
              />
              <div className="flex items-center gap-4 border-b border-border py-3">
                <div className="flex-1 text-[13px] font-medium">Reply tone</div>
                <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                  <option>Professional</option>
                  <option selected>Warm & friendly</option>
                  <option>Concise</option>
                </select>
              </div>
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1 text-[13px] font-medium">Signature</div>
                <input className="harwick-control w-[230px] px-[11px] py-[7px] text-[12.5px]" defaultValue="- Sarah Kim, Prestige Realty" />
              </div>
            </SettingsSection>

            <SettingsSection title="Voice Agent">
              <ToggleRow
                checked={preferences.transferQualifiedCalls}
                description="Voice agent routes matching calls to your line"
                label="Transfer qualified calls to me"
                onToggle={() => setPreferences((current) => ({ ...current, transferQualifiedCalls: !current.transferQualifiedCalls }))}
              />
              <div className="flex items-center gap-4 border-b border-border py-3">
                <div className="flex-1 text-[13px] font-medium">My transfer number</div>
                <input className="harwick-control w-[155px] px-[11px] py-[7px] text-[12.5px]" defaultValue="(305) 555-8844" />
              </div>
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1 text-[13px] font-medium">Availability hours</div>
                <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                  <option>9 AM – 6 PM daily</option>
                  <option>Mon–Fri 9–6</option>
                  <option selected>Mon–Sat 9–7</option>
                </select>
              </div>
            </SettingsSection>

            <SettingsSection danger title="Danger Zone">
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-foreground">Leave workspace</div>
                  <div className="mt-1 text-[11.5px] text-muted-subtle">Remove yourself from Prestige Realty</div>
                </div>
                <Button
                  className="rounded-[8px] border-oxblood-soft bg-transparent px-3 text-[11px] text-hot hover:bg-oxblood-soft/50 hover:text-hot"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Leave
                </Button>
              </div>
            </SettingsSection>
          </div>
        </div>
      </div>
    </div>
  );
}
