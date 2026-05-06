"use client";

import { Eye, EyeOff, Mail, LockKeyhole } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { generateGreenMaterial } from "../../lib/green-material";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { normalizeAuthRedirect } from "./redirects";

type LoginPageProps = {
  error: string | null;
  next: string | null;
};

export function LoginPage(props: LoginPageProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const nextPath = normalizeAuthRedirect(props.next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(
    props.error === "no_workspace" ? "your account is not attached to a workspace yet." : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const material = generateGreenMaterial(`${email}::${password}`);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);
    if (error !== null) {
      setStatus("could not sign in with those details.");
      return;
    }

    window.location.assign(nextPath);
  }

  async function signInWithGoogle() {
    setIsLoading(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        scopes: "openid email profile https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error !== null) {
      setIsLoading(false);
      setStatus("could not start google sign in.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-6 text-foreground">
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-all duration-700"
        style={{ background: material.pageBackground }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(6,18,12,0.16)_72%,rgba(4,12,8,0.28)_100%)]"
      />
      {material.orbs.map((orb, index) => (
        <div
          aria-hidden="true"
          className="absolute rounded-full blur-3xl transition-all duration-700"
          key={`orb-${index}`}
          style={{
            background: orb.background,
            height: orb.height,
            left: orb.left,
            opacity: orb.opacity,
            top: orb.top,
            width: orb.width,
          }}
        />
      ))}

        <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[420px] flex-col justify-center">
          <div className="mb-8 text-white">
            <div className="font-display text-[26px] font-medium leading-none drop-shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
              Harwick
            </div>
          </div>

        <section
          className="rounded-[24px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(249,250,247,0.92))] px-5 py-5 backdrop-blur-md"
          style={{ boxShadow: material.cardShadow }}
        >
          <div className="mb-5">
            <h1 className="font-display text-[24px] font-medium leading-none text-foreground">
              sign in
            </h1>
            <p className="mt-2 text-[12.5px] leading-5 text-muted">
              use the account your workspace owner invited.
            </p>
          </div>

          <Button
            className="h-10 w-full rounded-full border-[#d4ddd7] bg-white/80 text-[12px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-white"
            disabled={isLoading}
            onClick={() => {
              void signInWithGoogle();
            }}
            type="button"
            variant="outline"
          >
            continue with google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-subtle">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              void signInWithPassword(event);
            }}
          >
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <Mail aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                email
              </span>
              <Input
                autoComplete="email"
                className="h-11 rounded-[14px] border-[#d8ddd6] bg-white/78 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] focus-visible:ring-[3px]"
                onChange={(event) => setEmail(event.target.value)}
                required
                style={{
                  borderColor: "#d8ddd6",
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.72)`,
                }}
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                password
              </span>
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="h-11 rounded-[14px] border-[#d8ddd6] bg-white/78 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] focus-visible:ring-[3px] pr-10"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  style={{
                    borderColor: "#d8ddd6",
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.72)`,
                  }}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  ) : (
                    <Eye aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </label>
            <Button
              className="h-11 w-full rounded-full text-[12px] font-semibold text-white hover:brightness-[1.04]"
              disabled={isLoading}
              style={{
                background: material.buttonBackground,
                border: `1px solid ${material.buttonBorder}`,
                boxShadow: material.buttonShadow,
              }}
              type="submit"
            >
              {isLoading ? "checking..." : "sign in"}
            </Button>
          </form>

          {status === null ? null : (
            <div
              className="mt-4 rounded-[14px] border bg-[rgba(232,239,235,0.72)] px-3 py-2 text-[12px] leading-5 text-muted"
              style={{ borderColor: material.glowTint }}
            >
              {status}
            </div>
          )}
        </section>
      </div>

      <style>{`
        input[data-slot="input"]:focus-visible {
          border-color: ${material.focusBorder};
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.72),
            0 0 0 3px ${material.focusRing};
        }

        button[data-slot="button"]:focus-visible {
          border-color: ${material.focusBorder};
          box-shadow: 0 0 0 3px ${material.focusRing};
        }
      `}</style>
    </main>
  );
}
