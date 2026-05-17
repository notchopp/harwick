"use client";

import { useState } from "react";

import type { WorkspaceInvitationPreview } from "@realty-ops/core";

type InvitePageProps = {
  token: string;
  preview: WorkspaceInvitationPreview;
  viewerEmail: string | null;
};

type AcceptState =
  | { status: "idle" }
  | { status: "accepting" }
  | { status: "error"; message: string };

function emailsMatch(invitedEmail: string, viewerEmail: string | null): boolean {
  if (viewerEmail === null) return false;
  return invitedEmail.toLowerCase() === viewerEmail.toLowerCase();
}

export function InvitePage({ token, preview, viewerEmail }: InvitePageProps) {
  const [state, setState] = useState<AcceptState>({ status: "idle" });

  const isAccepted = preview.acceptedAt !== null;
  const isRevoked = preview.revokedAt !== null;
  const isExpired = preview.expired;
  const isOpen = !isAccepted && !isRevoked && !isExpired;
  const matches = emailsMatch(preview.invitedEmail, viewerEmail);

  async function accept() {
    setState({ status: "accepting" });
    try {
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const code = typeof detail.error === "string" ? detail.error : "accept_failed";
        const message =
          code === "email_mismatch"
            ? `This invite is for ${preview.invitedEmail}. Sign in with that account to accept.`
            : code === "expired"
            ? "This invitation has expired."
            : code === "revoked"
            ? "This invitation was revoked."
            : code === "unauthorized"
            ? "Sign in to accept this invitation."
            : "Could not accept the invitation. Try again.";
        setState({ status: "error", message });
        return;
      }
      window.location.assign("/home");
    } catch {
      setState({ status: "error", message: "Network error. Try again." });
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0d0f] px-5 py-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(154,181,170,0.10), transparent 55%)," +
            "radial-gradient(ellipse at 70% 100%, rgba(123,166,255,0.07), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-[440px] flex-col justify-center">
        <section className="rounded-[20px] border border-white/12 bg-white/[0.04] p-6 backdrop-blur-sm">
          <div className="font-display text-[11px] uppercase tracking-[0.16em] text-white/45">
            You've been invited
          </div>
          <h1 className="mt-2 font-display text-[26px] font-medium leading-tight tracking-[-0.01em]">
            Join {preview.workspaceName}
          </h1>
          <p className="mt-2 text-[13.5px] leading-5 text-white/65">
            {preview.inviterDisplayName === null
              ? "An owner"
              : `${preview.inviterDisplayName}`}
            {" "}invited{" "}
            <span className="text-white">{preview.invitedEmail}</span>
            {" "}to join as <span className="text-white">{preview.role}</span>.
          </p>

          <dl className="mt-6 space-y-2 text-[12px]">
            <Row label="Workspace" value={preview.workspaceName} />
            <Row label="Role" value={preview.role} />
            <Row label="Expires" value={new Date(preview.expiresAt).toLocaleString()} />
          </dl>

          {isRevoked ? (
            <Banner tone="error">This invitation was revoked by the workspace owner.</Banner>
          ) : isExpired ? (
            <Banner tone="error">This invitation has expired. Ask the owner to send a fresh one.</Banner>
          ) : isAccepted ? (
            <Banner tone="ok">Already accepted — open the workspace to continue.</Banner>
          ) : viewerEmail === null ? (
            <div className="mt-6 flex flex-col gap-2">
              <Banner tone="info">Sign in with {preview.invitedEmail} to accept.</Banner>
              <a
                href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#0a0d0f] transition hover:brightness-105"
              >
                Sign in to accept
              </a>
              <a
                href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-[13px] font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Create an account
              </a>
            </div>
          ) : !matches ? (
            <div className="mt-6 flex flex-col gap-2">
              <Banner tone="error">
                You're signed in as {viewerEmail}. This invite is for {preview.invitedEmail}.
              </Banner>
              <a
                href="/auth/logout"
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-[13px] font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Sign out and try again
              </a>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={state.status === "accepting"}
                onClick={() => {
                  void accept();
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#0a0d0f] transition hover:brightness-105 disabled:opacity-60"
              >
                {state.status === "accepting" ? "Joining…" : `Join ${preview.workspaceName}`}
              </button>
              {state.status === "error" ? <Banner tone="error">{state.message}</Banner> : null}
            </div>
          )}

          {isOpen ? (
            <p className="mt-4 text-center text-[11px] text-white/35">
              By joining you agree to Harwick's{" "}
              <a className="underline" href="/terms">terms</a> and{" "}
              <a className="underline" href="/privacy">privacy policy</a>.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-1.5">
      <dt className="text-white/45">{label}</dt>
      <dd className="text-white/85">{value}</dd>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "info" | "error";
  children: React.ReactNode;
}) {
  const palette =
    tone === "ok"
      ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200"
      : tone === "info"
      ? "border-white/15 bg-white/[0.04] text-white/75"
      : "border-red-400/30 bg-red-500/10 text-red-200";
  return (
    <div className={`mt-5 rounded-[12px] border px-3.5 py-2.5 text-[12.5px] leading-5 ${palette}`}>
      {children}
    </div>
  );
}
