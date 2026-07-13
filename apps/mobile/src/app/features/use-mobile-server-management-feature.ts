import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileImageUploadOutcome } from "../../media/mobile-image-upload-service";
import { useMobileImageUpload } from "../../media/use-mobile-image-upload";
import { patchMobileServerIconCaches } from "../../query/mobile-server-cache";
import { mobileQueryKeys } from "../../query/mobile-query-keys";
import type { MobileApiClient } from "../../api/mobile-api-client";
import { useMobileServerManagementMutations } from "../../query/use-mobile-server-management-mutations";

export function useMobileServerManagementFeature({
  client,
  onOpenServer,
}: {
  client: MobileApiClient;
  onOpenServer(serverId: string): void;
}) {
  const mutations = useMobileServerManagementMutations(client);
  const queryClient = useQueryClient();
  const { isBusy: isServerIconUploading, selectAndUpload } = useMobileImageUpload();
  const [isCreateJoinSheetOpen, setCreateJoinSheetOpen] = useState(false);
  const [serverIconTargetId, setServerIconTargetId] = useState<string | null>(null);
  const selectedServerIdRef = useRef<string | null>(null);

  const selectServer = useCallback(
    (serverId: string) => {
      if (selectedServerIdRef.current === serverId) {
        return;
      }

      selectedServerIdRef.current = serverId;
      onOpenServer(serverId);
      Promise.resolve().then(() => {
        if (selectedServerIdRef.current === serverId) {
          selectedServerIdRef.current = null;
        }
      });
    },
    [onOpenServer],
  );

  const createServer = useCallback(
    async (input: { name: string }) => {
      const response = await mutations.createServer.mutateAsync({
        allowFileUploads: true,
        allowGifs: true,
        allowMemberAdds: true,
        ...input,
      });
      selectServer(response.server.id);
      return { serverId: response.server.id };
    },
    [mutations.createServer, selectServer],
  );
  const joinServer = useCallback(
    async (input: { inviteCode: string }) => {
      const response = await mutations.joinServer.mutateAsync(input);
      selectServer(response.server.id);
      return { serverId: response.server.id };
    },
    [mutations.joinServer, selectServer],
  );
  const createInvite = useCallback(
    (serverId: string) => mutations.createInvite.mutateAsync({ serverId }),
    [mutations.createInvite],
  );
  const uploadServerIcon = useCallback(
    async (
      serverId: string,
      onLocalPreview: (localUri: string) => void,
    ): Promise<MobileImageUploadOutcome> => {
      const outcome = await selectAndUpload(
        { purpose: "server-icon", targetServerId: serverId },
        onLocalPreview,
      );

      if (
        outcome.status !== "claimed" ||
        outcome.response.purpose !== "server-icon" ||
        outcome.response.server.id !== serverId
      ) {
        return outcome.status === "claimed"
          ? { message: "The server icon could not be synchronized.", status: "error" }
          : outcome;
      }

      patchMobileServerIconCaches({
        iconUrl: outcome.response.server.iconUrl,
        queryClient,
        serverId,
      });
      void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
      void queryClient.invalidateQueries({
        exact: true,
        queryKey: mobileQueryKeys.workspace(serverId),
      });
      return outcome;
    },
    [queryClient, selectAndUpload],
  );

  const openServerIconUpload = useCallback(
    (serverId: string) => {
      selectServer(serverId);
      setServerIconTargetId(serverId);
      setCreateJoinSheetOpen(true);
    },
    [selectServer],
  );

  return {
    busy:
      mutations.createInvite.isPending ||
      mutations.createServer.isPending ||
      mutations.joinServer.isPending ||
      isServerIconUploading,
    closeCreateJoinSheet: () => {
      setCreateJoinSheetOpen(false);
      setServerIconTargetId(null);
    },
    createInvite,
    createServer,
    isCreateJoinSheetOpen,
    joinServer,
    openCreateJoinSheet: () => setCreateJoinSheetOpen(true),
    openServerIconUpload,
    selectServer,
    serverIconTargetId,
    uploadServerIcon,
  };
}
