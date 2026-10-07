"use client";

import { useEffect, useState } from "react";
import { BellRing, Mail, ScrollText, Slack } from "lucide-react";
import { Panel, PanelHeader, PageHeader } from "@/components/ui/panel";
import { ToneBadge, Callout, type Tone } from "@/components/ui/guidance";

type ResendStatus = { apiKeyConfigured: boolean; fromCustom: boolean };

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  state: string;
  tone: Tone;
  /** What an admin would have to do to change it, when it is not editable here. */
  howToChange?: string;
};

export default function AdminSettingsPage() {
  const [resendStatus, setResendStatus] = useState<ResendStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings/resend", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ResendStatus | null) => {
        if (!cancelled && data) setResendStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const emailState =
    resendStatus === null
      ? { label: "Checking…", tone: "info" as Tone }
      : resendStatus.apiKeyConfigured
        ? {
            label: resendStatus.fromCustom ? "On · custom sender" : "On · default sender",
            tone: "done" as Tone,
          }
        : { label: "Not configured", tone: "act" as Tone };

  const features: Feature[] = [
    {
      icon: BellRing,
      name: "SLA reminders",
      description:
        "Division heads are warned before an enquiry passes its deadline, and again once it breaches.",
      state: "On",
      tone: "done",
      howToChange: "Built into the system. The deadline itself is set per stage in the workflow.",
    },
    {
      icon: ScrollText,
      name: "Audit logging",
      description:
        "Every acceptance, transfer, rejection and completion is recorded with who did it and when.",
      state: "On",
      tone: "done",
      howToChange: "Always on — it cannot be disabled, for compliance reasons.",
    },
    {
      icon: Mail,
      name: "Email notifications",
      description:
        "Sends enquiry updates and password emails through Resend.",
      state: emailState.label,
      tone: emailState.tone,
      howToChange:
        "Set RESEND_API_KEY and RESEND_FROM in the server environment, then restart the app.",
    },
    {
      icon: Slack,
      name: "Slack alerts",
      description: "Post SLA alerts and key events into a Slack channel.",
      state: "Not set up",
      tone: "info",
      howToChange: "Not connected yet. This needs a Slack app and webhook before it can be enabled.",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="What the system does automatically, and where each setting is controlled."
      />

      <Callout tone="info" title="These settings are configured on the server">
        Nothing on this page can be switched on from the browser. Each row says exactly what has to
        change and where, so you are never left clicking a button that does nothing.
      </Callout>

      <Panel>
        <PanelHeader title="System features" caption="Current state of every automatic behaviour" />
        <ul className="divide-y divide-[var(--app-line-soft)]">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.name} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-surface-sunk)]">
                  <Icon className="h-4.5 w-4.5 text-[var(--app-ink-2)]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--app-ink)]">{f.name}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[var(--app-ink-2)]">
                    {f.description}
                  </p>
                  {f.howToChange ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-ink-3)]">
                      {f.howToChange}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <ToneBadge tone={f.tone}>{f.state}</ToneBadge>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
