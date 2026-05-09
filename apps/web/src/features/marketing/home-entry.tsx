"use client";

import { useLayoutEffect, useRef } from "react";
import { ArrowRight, CircleDot } from "lucide-react";
import gsap from "gsap";

export function HomeEntry({ isAuthenticated }: { isAuthenticated: boolean }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (scope === null) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      gsap.set(scope.querySelectorAll("[data-entry-hidden]"), { opacity: 1, clearProps: "transform,filter" });
      return;
    }

    const context = gsap.context(() => {
      gsap.set("[data-entry-copy]", { opacity: 0, y: 18 });
      gsap.set("[data-entry-video]", { opacity: 0, y: 16, scale: 0.975, filter: "brightness(0.72)" });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to("[data-entry-copy]", { opacity: 1, y: 0, duration: 0.58, stagger: 0.07 })
        .to("[data-entry-video]", { opacity: 1, y: 0, scale: 1, filter: "brightness(0.92)", duration: 0.8 }, "-=0.28");
    }, scope);

    return () => {
      context.revert();
    };
  }, []);

  return (
    <div className="relative overflow-hidden px-5 pb-7 pt-10 text-center sm:pb-8 sm:pt-12" ref={scopeRef}>
      <div
        aria-hidden="true"
        className="absolute inset-x-[-20%] top-[-18rem] h-[48rem] bg-[radial-gradient(circle_at_50%_36%,rgba(75,176,121,0.28),rgba(14,92,61,0.18)_32%,rgba(2,3,3,0)_68%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[28rem] bg-[linear-gradient(180deg,rgba(3,47,32,0.38),rgba(5,6,7,0))]"
      />

      <div className="relative mx-auto max-w-[980px]">
        <div
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#6ee59a]/20 bg-[#0b2a1c]/45 px-3 py-1.5 text-[12px] font-medium text-[#a9dcb8] backdrop-blur-md"
          data-entry-copy
          data-entry-hidden
        >
          <CircleDot aria-hidden="true" className="size-3.5 text-[#74f0a0]" />
          AI chief of staff for real estate teams
        </div>

        <h1
          className="mx-auto mt-4 max-w-[730px] text-[48px] font-semibold leading-[0.98] text-white sm:text-[68px] lg:text-[78px]"
          data-entry-copy
          data-entry-hidden
        >
          Your lead desk, always on.
        </h1>

        <p className="mx-auto mt-4 max-w-[590px] text-[15px] leading-7 text-white/58" data-entry-copy data-entry-hidden>
          Harwick captures every inbound, drafts the next move, and waits for approval before anything leaves the house.
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row" data-entry-copy data-entry-hidden>
          <a
            className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-[13px] font-semibold transition hover:bg-white/88"
            href="#request-access"
            style={{ color: "#050607" }}
          >
            Create account
          </a>
          <a
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.035] px-5 text-[13px] font-semibold text-white/72 transition hover:bg-white/[0.07] hover:text-white"
            href={isAuthenticated ? "/home" : "/login"}
          >
            {isAuthenticated ? "Open dashboard" : "Log in"}
          </a>
          <a
            className="inline-flex h-10 items-center justify-center gap-2 px-2 text-[13px] font-medium text-[#8ad9a7] transition hover:text-white"
            href="#system"
          >
            Approval-first automation
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>

      <div
        className="relative mx-auto -mt-1 w-full max-w-[600px]"
        data-entry-hidden
        data-entry-video
        style={{ mixBlendMode: "screen" }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-8 bottom-2 h-20 rounded-full bg-[#34d37d]/18 blur-3xl"
        />
        <video
          aria-label="Animated engraved house opening into Harwick"
          autoPlay
          className="relative mx-auto block w-full"
          loop
          muted
          playsInline
          poster="/marketing/harwick-house-poster.jpg"
          preload="auto"
          src="/marketing/harwick-house-entry.mp4"
        />
      </div>
    </div>
  );
}
