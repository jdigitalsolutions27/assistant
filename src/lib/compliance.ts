export type ComplianceSeverity = "high" | "medium";

export type ComplianceIssue = {
  severity: ComplianceSeverity;
  rule: string;
  message: string;
  match: string;
};

const RULES: Array<{
  severity: ComplianceSeverity;
  rule: string;
  message: string;
  pattern: RegExp;
}> = [
  {
    severity: "high",
    rule: "no-guaranteed-results",
    message: "Avoid guaranteed claims.",
    pattern: /\b(guarantee|guaranteed|sure win|100%\s*(result|results|bookings|success)?)\b/i,
  },
  {
    severity: "medium",
    rule: "no-pressure-sales",
    message: "Avoid aggressive pressure phrases.",
    pattern: /\b(act now|urgent|limited slots?|last chance|don't miss out)\b/i,
  },
  {
    severity: "medium",
    rule: "no-superlative-claims",
    message: "Avoid unverifiable superlative claims.",
    pattern: /\b(best in|number\s*1|top[-\s]?rated|fastest results?)\b/i,
  },
];

function dedupeWhitespace(value: string): string {
  return value.replace(/\s{2,}/g, " ").trim();
}

export function lintOutreachText(text: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const rule of RULES) {
    const matches = Array.from(text.matchAll(new RegExp(rule.pattern.source, "gi")));
    for (const match of matches) {
      const raw = match[0]?.trim();
      if (!raw) continue;
      issues.push({
        severity: rule.severity,
        rule: rule.rule,
        message: rule.message,
        match: raw,
      });
    }
  }
  return issues;
}

export function sanitizeOutreachText(text: string): string {
  let next = text;

  next = next.replace(/\b(guarantee|guaranteed)\b/gi, "help improve");
  next = next.replace(/\b100%\s*(result|results|bookings|success)?\b/gi, "strong outcomes");
  next = next.replace(/\b(sure win)\b/gi, "better chance");
  next = next.replace(/\b(act now|urgent|limited slots?|last chance|don't miss out)\b/gi, "if timing fits your team");
  next = next.replace(/\b(best in|number\s*1|top[-\s]?rated|fastest results?)\b/gi, "proven approach");
  next = next.replace(/!{2,}/g, "!");

  return dedupeWhitespace(next);
}

export function sanitizeMessageVariants<T extends { message_text: string }>(variants: T[]): T[] {
  return variants.map((variant) => ({
    ...variant,
    message_text: sanitizeOutreachText(variant.message_text),
  }));
}

