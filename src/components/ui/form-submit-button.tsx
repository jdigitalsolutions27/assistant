"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type FormSubmitButtonProps = Omit<ButtonProps, "children"> & {
  idleLabel: React.ReactNode;
  pendingLabel?: React.ReactNode;
  showSpinner?: boolean;
};

export function FormSubmitButton({
  idleLabel,
  pendingLabel,
  disabled,
  type = "submit",
  showSpinner = true,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type={type} disabled={disabled || pending} aria-live="polite" {...props}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          {showSpinner ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pendingLabel ?? "Processing..."}
        </span>
      ) : (
        idleLabel
      )}
    </Button>
  );
}

