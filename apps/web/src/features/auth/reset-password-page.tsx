"use client";

import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { generateGreenMaterial } from "../../lib/green-material";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";

export function ResetPasswordPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const material = generateGreenMaterial(password);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus("use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("passwords do not match.");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error !== null) {
      setStatus("that reset link is expired or invalid. request a new one from sign in.");
      return;
    }

    window.location.assign("/home");
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
              reset password
            </h1>
            <p className="mt-2 text-[12.5px] leading-5 text-muted">
              choose a new password for this workspace account.
            </p>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              void updatePassword(event);
            }}
          >
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                new password
              </span>
              <div className="relative">
                <Input
                  autoComplete="new-password"
                  className="h-11 rounded-[14px] border-[#d8ddd6] bg-white/78 pr-10 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] focus-visible:ring-[3px]"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  style={{
                    borderColor: "#d8ddd6",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
                  }}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
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

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                confirm password
              </span>
              <Input
                autoComplete="new-password"
                className="h-11 rounded-[14px] border-[#d8ddd6] bg-white/78 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] focus-visible:ring-[3px]"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                style={{
                  borderColor: "#d8ddd6",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
                }}
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
              />
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
              {isLoading ? "updating..." : "update password"}
            </Button>
          </form>

          <a
            className="mt-3 block rounded-full px-3 py-2 text-center text-[12px] font-semibold text-muted transition hover:text-foreground"
            href="/login"
          >
            back to sign in
          </a>

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
    </main>
  );
}
