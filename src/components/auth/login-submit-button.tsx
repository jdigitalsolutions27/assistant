"use client";

import { FormSubmitButton } from "@/components/ui/form-submit-button";

export function LoginSubmitButton() {
  return (
    <FormSubmitButton className="w-full" idleLabel="Sign In" pendingLabel="Signing in..." />
  );
}
