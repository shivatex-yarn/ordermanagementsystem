"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface IdleWarningDialogProps {
  secondsLeft: number | null;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
}

export function IdleWarningDialog({
  secondsLeft,
  onStayLoggedIn,
  onLogoutNow,
}: IdleWarningDialogProps) {
  const open = secondsLeft !== null && secondsLeft > 0;
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the "Stay logged in" button when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => buttonRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onStayLoggedIn(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Session expiring soon</DialogTitle>
          <DialogDescription>
            You&apos;ve been inactive for a while. You&apos;ll be automatically signed out in{" "}
            <span className="font-semibold text-slate-900">
              {secondsLeft}s
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onLogoutNow}>
            Sign out now
          </Button>
          <Button ref={buttonRef} onClick={onStayLoggedIn}>
            Stay logged in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
