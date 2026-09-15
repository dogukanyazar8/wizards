"use client";
import React, { useRef, useSyncExternalStore } from "react";
import { Button } from "@wizards/ui";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "./locale-provider";
import {
  confirmationSnapshot,
  finishConfirmation,
  subscribeConfirmation,
} from "@/lib/confirmation";
const serverSnapshot = () => null;
export function ConfirmationHost() {
  const request = useSyncExternalStore(subscribeConfirmation, confirmationSnapshot, serverSnapshot);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();
  return (
    <Modal
      open={request !== null}
      title={t("common.confirm")}
      description={request?.message ?? ""}
      onClose={() => finishConfirmation(false)}
      initialFocusRef={cancelRef}
      closeLabel={t("common.cancel")}
      overlayStyle={{ zIndex: 1600 }}
    >
      <div className="flex justify-end gap-3">
        <Button ref={cancelRef} variant="outline" onClick={() => finishConfirmation(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          style={request?.danger ? { background: "hsl(var(--danger))", color: "white" } : undefined}
          onClick={() => finishConfirmation(true)}
        >
          {t("common.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
