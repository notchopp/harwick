"use client";

import { Eye, EyeOff, Mail, LockKeyhole } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { createBrowserSupabaseClient } from "../../lib/supabase/browser-client";
import { normalizeAuthRedirect } from "./redirects";

type LoginPageProps = {
  error: string | null;
  next: string | null;
};

type GreenFamily = {
  h: number;
  lBase: number;
  name: string;
  s: number;
};

type Bloom = {
  h: number;
  l: number;
  opacity: number;
  posX: number;
  posY: number;
  s: number;
  size: number;
};

type GreenMaterial = {
  buttonBackground: string;
  buttonBorder: string;
  buttonShadow: string;
  cardShadow: string;
  focusBorder: string;
  focusRing: string;
  glowTint: string;
  orbs: Array<{
    background: string;
    height: string;
    left: string;
    opacity: number;
    top: string;
    width: string;
  }>;
  pageBackground: string;
};

const greenFamilies: GreenFamily[] = [
  { h: 132, lBase: 0.13, name: "pine", s: 0.48 },
  { h: 141, lBase: 0.16, name: "sage", s: 0.42 },
  { h: 151, lBase: 0.14, name: "emerald", s: 0.54 },
  { h: 161, lBase: 0.12, name: "verdigris", s: 0.46 },
  { h: 118, lBase: 0.14, name: "moss", s: 0.4 },
];

function fnv1a(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lcg(seed: number) {
  let state = seed || 1;

  return function rng() {
    state = Math.imul(48271, state) | 0;
    return (state >>> 0) / 0xffffffff;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const normalizedHue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (normalizedHue < 60) {
    r = c;
    g = x;
  } else if (normalizedHue < 120) {
    r = x;
    g = c;
  } else if (normalizedHue < 180) {
    g = c;
    b = x;
  } else if (normalizedHue < 240) {
    g = x;
    b = c;
  } else if (normalizedHue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hslHex(h: number, s: number, l: number) {
  return toHex(...hslToRgb(h, s, l));
}

function rgbaString(h: number, s: number, l: number, alpha: number) {
  const [r, g, b] = hslToRgb(h, s, l);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function generateGreenMaterial(seedValue: string): GreenMaterial {
  const seed = seedValue.trim() === "" ? "harwick" : seedValue.trim().toLowerCase();
  const rng = lcg(fnv1a(seed));
  const blooms: Bloom[] = [];

  for (let index = 0; index < 4; index += 1) {
    const family = greenFamilies[Math.floor(rng() * greenFamilies.length)] ?? greenFamilies[0]!;

    blooms.push({
      h: (family.h + (rng() - 0.5) * 18 + 360) % 360,
      l: 0.46 + rng() * 0.16,
      opacity: 0.18 + rng() * 0.16,
      posX: 12 + rng() * 76,
      posY: 8 + rng() * 78,
      s: Math.min(0.72, Math.max(0.34, family.s + (rng() - 0.5) * 0.12)),
      size: 28 + rng() * 24,
    });
  }

  const baseHue = blooms[0]?.h ?? 141;
  const baseAngle = 136 + Math.floor(rng() * 28);
  const darkStops = [
    hslHex(baseHue - 8, 0.34, 0.12),
    hslHex(baseHue + 6, 0.4, 0.19),
    hslHex(baseHue - 12, 0.3, 0.14),
  ];

  const bloomLayers = blooms.map((bloom) => {
    const [r, g, b] = hslToRgb(bloom.h, bloom.s, bloom.l);

    return `radial-gradient(ellipse at ${bloom.posX.toFixed(1)}% ${bloom.posY.toFixed(1)}%, rgba(${r},${g},${b},${bloom.opacity.toFixed(3)}) 0%, transparent ${bloom.size.toFixed(1)}%)`;
  });

  const texture =
    "repeating-linear-gradient(112deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 9px)";
  const baseGradient =
    `linear-gradient(${baseAngle}deg, ${darkStops[0]} 0%, ${darkStops[1]} 52%, ${darkStops[2]} 100%)`;

  return {
    buttonBackground: [
      `linear-gradient(145deg, ${hslHex(baseHue + 8, 0.54, 0.34)} 0%, ${hslHex(baseHue - 4, 0.5, 0.2)} 100%)`,
    ].join(", "),
    buttonBorder: rgbaString(baseHue + 10, 0.45, 0.6, 0.22),
    buttonShadow: [
      `inset 0 1px 0 ${rgbaString(baseHue + 12, 0.54, 0.82, 0.18)}`,
      `0 18px 38px ${rgbaString(baseHue - 6, 0.48, 0.14, 0.28)}`,
    ].join(", "),
    cardShadow: `0 36px 90px ${rgbaString(baseHue - 8, 0.34, 0.11, 0.34)}`,
    focusBorder: hslHex(baseHue + 4, 0.42, 0.45),
    focusRing: rgbaString(baseHue + 4, 0.44, 0.42, 0.18),
    glowTint: rgbaString(baseHue + 2, 0.42, 0.44, 0.2),
    orbs: blooms.slice(0, 3).map((bloom, index) => ({
      background: `radial-gradient(circle, ${rgbaString(bloom.h, bloom.s, bloom.l, 0.22 + index * 0.03)} 0%, transparent 70%)`,
      height: `${420 + index * 110}px`,
      left: `${Math.max(8, bloom.posX - 16).toFixed(1)}%`,
      opacity: 0.9,
      top: `${Math.max(4, bloom.posY - 18).toFixed(1)}%`,
      width: `${420 + index * 110}px`,
    })),
    pageBackground: [texture, ...bloomLayers, baseGradient].join(", "),
  };
}

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
        scopes: "openid email profile",
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
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/70">
            real estate ai layer
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
