import { Sparkles } from "lucide-react";

import { Shell } from "../../../components/panels/panels";
import { MicroLabel } from "../../../components/panels/typography";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="harwick-shell-dark min-h-screen bg-[color:var(--panel-0)] text-[color:var(--graphite-text)]">
      <div className="mx-auto w-full max-w-[640px] px-5 py-10">
        <div className="mb-1 inline-flex items-center gap-2">
          <MicroLabel>harwick · voice setup</MicroLabel>
        </div>
        <h1 className="mb-3 font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)]">
          &ldquo;Hey Siri, ask Harwick&hellip;&rdquo;
        </h1>
        <p className="mb-6 text-[14px] leading-6 text-[color:var(--graphite-text-muted)]">
          Apple doesn&apos;t let web apps register with Siri directly. The fix takes 60 seconds:
          create one Shortcut that Siri can run by name, and it&apos;ll forward your voice to
          Harwick. After that you can say it hands-free, in the car, anywhere.
        </p>

        <Shell className="mb-5 p-5">
          <ol className="space-y-4 text-[14px] leading-6 text-[color:var(--graphite-text)]">
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                1
              </span>
              <span>
                On your iPhone, open the <strong>Shortcuts</strong> app and tap <strong>+</strong> to make a new shortcut.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                2
              </span>
              <span>
                Add the <strong>Dictate Text</strong> action. Set <em>Stop Listening</em> to <em>On Tap</em> for short bursts,
                or <em>After Pause</em> while driving.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                3
              </span>
              <span>
                Add the <strong>URL</strong> action with this exact URL (replace the host with your live workspace):
                <span className="mt-2 block rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-3 py-2 font-mono text-[12px] text-[color:var(--graphite-text)]">
                  https://harwick.app/v?voice=1&amp;q=[Dictated Text]
                </span>
                <span className="mt-2 block text-[12.5px] text-[color:var(--graphite-text-muted)]">
                  The bracketed <code className="font-mono text-[11.5px]">[Dictated Text]</code> should be the
                  <em> Dictated Text</em> variable from step 2, dropped in via the variable picker.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                4
              </span>
              <span>
                Add the <strong>Open URLs</strong> action right after. (Not <em>Get Contents of URL</em> — we want Safari to open it.)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                5
              </span>
              <span>
                Name the shortcut <strong>&ldquo;Ask Harwick&rdquo;</strong>. Save.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[12px] font-semibold">
                6
              </span>
              <span>
                Try it: hold the side button and say <strong>&ldquo;Hey Siri, Ask Harwick&rdquo;</strong>. Siri runs the
                shortcut, dictates your question, opens Harwick, and the answer plays back out loud.
              </span>
            </li>
          </ol>
        </Shell>

        <Shell className="mb-5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-3.5 text-[var(--sage)]" aria-hidden="true" />
            <MicroLabel className="text-[var(--sage)]">in the car</MicroLabel>
          </div>
          <p className="text-[13.5px] leading-6 text-[color:var(--graphite-text-muted)]">
            Mount the phone, install Harwick to your Home Screen so it opens chromeless,
            and the voice screen will keep itself awake using the Screen Wake Lock API.
            Tap the mic, say what you need, and the answer comes back through your car&apos;s audio
            via Bluetooth.
          </p>
        </Shell>

        <Shell className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <MicroLabel>coming next</MicroLabel>
          </div>
          <p className="text-[13.5px] leading-6 text-[color:var(--graphite-text-muted)]">
            We&apos;re building a native iOS shell that registers Harwick&apos;s commands directly with
            Siri and CarPlay — &ldquo;Hey Siri, ask Harwick what&apos;s hot&rdquo; with no Shortcut setup.
            Until that ships, the Shortcut above is the bridge.
          </p>
        </Shell>
      </div>
    </main>
  );
}
