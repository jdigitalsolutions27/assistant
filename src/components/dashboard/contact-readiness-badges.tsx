import { getContactReadiness, type ContactReadinessInput } from "@/lib/contact-readiness";

export function ContactReadinessBadges({
  facebook_url,
  website_url,
  email,
  phone,
  compact = false,
}: ContactReadinessInput & { compact?: boolean }) {
  const readiness = getContactReadiness({ facebook_url, website_url, email, phone });

  const tierClass =
    readiness.tier === "Ready"
      ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
      : readiness.tier === "Partial"
        ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
        : "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300";

  const itemClass = compact
    ? "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
    : "rounded-md border px-2 py-0.5 text-[11px] font-semibold";

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`${itemClass} ${tierClass}`}>
        {readiness.tier} ({readiness.available_channels}/4)
      </span>
      {readiness.has_facebook ? (
        <span className={`${itemClass} border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300`}>
          FB
        </span>
      ) : null}
      {readiness.has_website ? (
        <span className={`${itemClass} border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300`}>
          WEB
        </span>
      ) : null}
      {readiness.has_email ? (
        <span className={`${itemClass} border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300`}>
          EMAIL
        </span>
      ) : null}
      {readiness.has_phone ? (
        <span className={`${itemClass} border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-800/60 dark:bg-cyan-950/40 dark:text-cyan-300`}>
          PHONE
        </span>
      ) : null}
    </div>
  );
}
