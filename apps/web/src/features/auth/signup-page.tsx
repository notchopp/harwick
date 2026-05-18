"use client";

import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";

export function SignupPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function createAccountWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding")}`,
      },
    });

    setIsLoading(false);
    if (error !== null) {
      setStatus("Couldn't create that account.");
      return;
    }

    window.location.assign("/onboarding");
  }

  async function createAccountWithGoogle() {
    setIsLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding")}`,
        scopes: "openid email profile",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error !== null) {
      setIsLoading(false);
      setStatus("Couldn't start Google signup.");
    }
  }

  return (
    <main
      data-fixed-viewport="true"
      className="relative bg-[#0a0d0f] px-5 text-white"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 24px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(123,166,255,0.08), transparent 55%),"
            + "radial-gradient(ellipse at 80% 100%, rgba(154,181,170,0.08), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-[420px] flex-col justify-center overflow-y-auto">
        <header className="mb-10 text-center">
          <img
            src="/harwick-gemini-logo.png"
            alt="Harwick"
            className="mx-auto mb-6 h-12 w-auto select-none"
            draggable={false}
          />
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.02em]">
            Create your account.
          </h1>
          <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-5 text-white/60">
            Set up the owner account, then Harwick walks you through the workspace.
          </p>
        </header>

        <button
          className="mb-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[13px] font-medium text-white transition hover:bg-white/[0.07] disabled:opacity-50"
          disabled={isLoading}
          onClick={() => {
            void createAccountWithGoogle();
          }}
          type="button"
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            void createAccountWithPassword(event);
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-white/55">
              Email
            </span>
            <input
              autoComplete="email"
              className="h-11 w-full rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 text-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-white/35 focus:border-[#b8d3c5]/55 focus:bg-white/[0.07] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(184,211,197,0.18)]"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-white/55">
              Password
            </span>
            <div className="relative">
              <input
                autoComplete="new-password"
                className="h-11 w-full rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 pr-10 text-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-white/35 focus:border-[#b8d3c5]/55 focus:bg-white/[0.07] focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(184,211,197,0.18)]"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                )}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[13.5px] font-semibold text-[#0a0d0f] shadow-[0_18px_40px_-15px_rgba(255,255,255,0.4)] transition hover:brightness-105 disabled:opacity-60"
          >
            {isLoading ? "Creating..." : "Create account"}
          </button>
        </form>

        <a
          className="mt-5 block text-center text-[12.5px] text-white/55 transition hover:text-white"
          href="/login"
        >
          Already have an account? <span className="text-white/85">Sign in</span>
        </a>

        {status === null ? null : (
          <div className="mt-5 rounded-[12px] border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-5 text-red-200">
            {status}
          </div>
        )}

        <footer className="mt-10 text-center text-[10.5px] text-white/35">
          By creating an account you agree to the{" "}
          <a className="underline-offset-2 hover:underline" href="/terms">Terms</a>{" "}
          and{" "}
          <a className="underline-offset-2 hover:underline" href="/privacy">Privacy Policy</a>.
        </footer>
      </div>
    </main>
  );
}
