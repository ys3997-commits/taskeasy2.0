import type { PunctualityStats } from "@rajshree/shared";
import { cn } from "@/lib/utils";

type Audience = "self" | "member" | "company";

function punctualityCopy(stats: PunctualityStats, audience: Audience, memberName?: string) {
  const who = memberName || "This member";

  if (stats.completed === 0) {
    if (audience === "company") {
      return {
        tone: "neutral" as const,
        title: "No completed tasks yet",
        body: "Once the team finishes assigned work, on-time vs late rates will show here. Encourage everyone to close tasks before the deadline.",
      };
    }
    if (audience === "member") {
      return {
        tone: "neutral" as const,
        title: `${who} has no completed tasks yet`,
        body: "When they finish assigned work, you will see whether it landed on time. Nudge them to meet deadlines from the start.",
      };
    }
    return {
      tone: "neutral" as const,
      title: "Finish on time — it shows",
      body: "Complete your first assigned tasks before the deadline. On-time delivery builds trust and keeps work moving.",
    };
  }

  if (stats.on_time_percent >= 90) {
    if (audience === "company") {
      return {
        tone: "excellent" as const,
        title: "Excellent company punctuality",
        body: "The team finishes nearly everything before the deadline. That reliability keeps work moving — keep celebrating it.",
      };
    }
    if (audience === "member") {
      return {
        tone: "excellent" as const,
        title: `${who} delivers outstandingly on time`,
        body: `${who} finishes nearly everything before the deadline. That reliability sets a strong example for the team.`,
      };
    }
    return {
      tone: "excellent" as const,
      title: "Outstanding — you deliver on time",
      body: "You finish nearly everything before the deadline. That reliability sets the pace for the whole team. Keep it up.",
    };
  }

  if (stats.on_time_percent >= 75) {
    if (audience === "company") {
      return {
        tone: "good" as const,
        title: "Strong company punctuality",
        body: "Most completed work lands on time. A little more focus on remaining deadlines will make the team rock-solid.",
      };
    }
    if (audience === "member") {
      return {
        tone: "good" as const,
        title: `${who} has strong punctuality`,
        body: "Most of their work lands on time. Encourage them to close the rest before the deadline.",
      };
    }
    return {
      tone: "good" as const,
      title: "Strong punctuality — stay sharp",
      body: "Most of your work lands on time. A little extra focus on the remaining deadlines will make you rock-solid.",
    };
  }

  if (stats.on_time_percent >= 50) {
    if (audience === "company") {
      return {
        tone: "improve" as const,
        title: "Company deadlines need more focus",
        body: "About half of completed tasks missed the deadline. Push the team to close the next few early — small wins add up.",
      };
    }
    if (audience === "member") {
      return {
        tone: "improve" as const,
        title: `${who} can improve on deadlines`,
        body: "About half of their completed tasks missed the deadline. Ask them to prioritize due dates on the next few tasks.",
      };
    }
    return {
      tone: "improve" as const,
      title: "Room to improve on deadlines",
      body: "About half your completed tasks missed the deadline. Aim to close the next few early — small wins add up fast.",
    };
  }

  if (audience === "company") {
    return {
      tone: "urgent" as const,
      title: "Late completions are common",
      body: "Most completed tasks came in after the deadline. Make on-time delivery a clear priority across the team.",
    };
  }
  if (audience === "member") {
    return {
      tone: "urgent" as const,
      title: `${who} often finishes late`,
      body: "Most of their completed tasks came in after the deadline. Help them prioritize due dates to cut follow-ups.",
    };
  }
  return {
    tone: "urgent" as const,
    title: "Deadlines need your attention",
    body: "Most completed tasks came in late. Prioritize due dates first — finishing on time protects your reputation and reduces follow-ups.",
  };
}

const TONE_STYLES = {
  excellent: "border-brand-200 bg-gradient-to-b from-white to-brand-50/50",
  good: "border-brand-200 bg-gradient-to-b from-white to-brand-50/30",
  improve: "border-amber-200 bg-gradient-to-b from-white to-amber-50/40",
  urgent: "border-red-200 bg-gradient-to-b from-white to-red-50/40",
  neutral: "border-ink-200 bg-gradient-to-b from-white to-ink-50/40",
} as const;

export function emptyPunctuality(): PunctualityStats {
  return { completed: 0, on_time: 0, late: 0, on_time_percent: 0, late_percent: 0 };
}

export function sumPunctuality(items: PunctualityStats[]): PunctualityStats {
  const on_time = items.reduce((sum, item) => sum + item.on_time, 0);
  const late = items.reduce((sum, item) => sum + item.late, 0);
  const completed = on_time + late;
  const on_time_percent = completed === 0 ? 0 : Math.round((on_time / completed) * 100);
  return {
    completed,
    on_time,
    late,
    on_time_percent,
    late_percent: completed === 0 ? 0 : 100 - on_time_percent,
  };
}

export function PunctualityBoxes({
  stats,
  compact = false,
  showCounts = true,
  className,
}: {
  stats: PunctualityStats;
  compact?: boolean;
  showCounts?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-2 gap-2 sm:w-auto sm:gap-3",
        compact ? "sm:min-w-[240px]" : "sm:min-w-[280px]",
        className
      )}
    >
      <div
        className={cn(
          "rounded-lg border border-brand-100 bg-white/80 text-center",
          compact ? "px-3 py-2.5" : "px-4 py-3"
        )}
      >
        <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-brand-700 sm:text-xs">
          Done on time
        </p>
        <p
          className={cn(
            "mt-1 font-display font-semibold tabular-nums text-brand-800",
            compact ? "text-2xl" : "text-3xl"
          )}
        >
          {stats.completed === 0 ? "—" : `${stats.on_time_percent}%`}
        </p>
        {showCounts && stats.completed > 0 ? (
          <p className="mt-0.5 text-xs text-ink-500">
            {stats.on_time} of {stats.completed}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "rounded-lg border border-red-100 bg-white/80 text-center",
          compact ? "px-3 py-2.5" : "px-4 py-3"
        )}
      >
        <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-red-700 sm:text-xs">
          Done after deadline
        </p>
        <p
          className={cn(
            "mt-1 font-display font-semibold tabular-nums text-red-800",
            compact ? "text-2xl" : "text-3xl"
          )}
        >
          {stats.completed === 0 ? "—" : `${stats.late_percent}%`}
        </p>
        {showCounts && stats.completed > 0 ? (
          <p className="mt-0.5 text-xs text-ink-500">
            {stats.late} of {stats.completed}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PunctualityBar({
  stats,
  compact = false,
  className,
}: {
  stats: PunctualityStats;
  compact?: boolean;
  className?: string;
}) {
  if (stats.completed === 0) return null;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full bg-red-600",
        compact ? "h-1.5" : "h-2",
        className
      )}
      title={`${stats.on_time_percent}% on time, ${stats.late_percent}% after deadline`}
    >
      <div
        className="h-full bg-green-600"
        style={{ width: `${stats.on_time_percent}%` }}
      />
    </div>
  );
}

export function PunctualityPanel({
  stats,
  audience = "self",
  memberName,
  compact = false,
  showCounts = true,
  showNarrative = true,
  showBoxes = true,
  splitBar = false,
  className,
}: {
  stats: PunctualityStats | undefined;
  audience?: Audience;
  memberName?: string;
  compact?: boolean;
  showCounts?: boolean;
  showNarrative?: boolean;
  showBoxes?: boolean;
  splitBar?: boolean;
  className?: string;
}) {
  if (!stats) {
    return (
      <section
        className={cn(
          "rounded-xl border border-ink-200 bg-white shadow-sm",
          compact ? "p-4" : "p-5",
          className
        )}
      >
        <p className="text-sm text-ink-500">Loading on-time stats…</p>
      </section>
    );
  }

  const copy = punctualityCopy(stats, audience, memberName);

  return (
    <section
      className={cn(
        "rounded-xl border shadow-sm",
        compact ? "p-4" : "p-5",
        TONE_STYLES[copy.tone],
        className
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-4",
          compact && "gap-3"
        )}
      >
        {showNarrative ? (
          <div className={cn("max-w-xl", compact && "min-w-0 flex-1")}>
            <h2
              className={cn(
                "font-display font-semibold text-ink-900",
                compact ? "text-base" : "text-xl"
              )}
            >
              {copy.title}
            </h2>
            <p
              className={cn(
                "leading-relaxed text-ink-600",
                compact ? "mt-1 text-xs" : "mt-1.5 text-sm"
              )}
            >
              {copy.body}
            </p>
            {showCounts && stats.completed > 0 ? (
              <p className={cn("text-ink-500", compact ? "mt-1.5 text-[11px]" : "mt-2 text-xs")}>
                Based on {stats.completed} completed assigned{" "}
                {stats.completed === 1 ? "task" : "tasks"}.
              </p>
            ) : null}
          </div>
        ) : null}
        {showBoxes ? (
          <PunctualityBoxes stats={stats} compact={compact} showCounts={showCounts} />
        ) : null}
      </div>
      {splitBar ? (
        <PunctualityBar
          stats={stats}
          compact={compact}
          className={compact ? "mt-3" : "mt-4"}
        />
      ) : stats.completed > 0 ? (
        <div
          className={cn(
            "overflow-hidden rounded-full bg-ink-100",
            compact ? "mt-3 h-1.5" : "mt-4 h-2"
          )}
          title={`${stats.on_time_percent}% on time`}
        >
          <div
            className="h-full bg-brand-600 transition-all"
            style={{ width: `${stats.on_time_percent}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}
