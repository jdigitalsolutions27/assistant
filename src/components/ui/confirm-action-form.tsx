"use client";

import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function ConfirmActionForm({
  action,
  fields,
  buttonLabel,
  confirmTitle,
  confirmDescription,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  buttonVariant = "destructive",
  buttonSize = "sm",
  buttonClassName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  buttonLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel?: string;
  cancelLabel?: string;
  buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  buttonSize?: "default" | "sm" | "lg";
  buttonClassName?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!confirmed) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    setConfirmed(false);
  }

  function onConfirm() {
    setOpen(false);
    setConfirmed(true);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={onSubmit}>
        {Object.entries(fields).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <Button type="submit" variant={buttonVariant} size={buttonSize} className={buttonClassName}>
          {buttonLabel}
        </Button>
      </form>

      <ConfirmDialog
        open={open}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}
