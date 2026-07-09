import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClientProvider, focusManager, useQueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { createMobileQueryClient } from "../../query/mobile-query-client";

export function MobileQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createMobileQueryClient);

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });

    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function useMobileQueryClient() {
  return useQueryClient();
}
