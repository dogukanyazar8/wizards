"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  EMPTY_LAYER_STACK,
  type ServerLayer,
  type ServerLayerKind,
  type ServerLayerStack,
  closeLayer,
  closeTopLayer,
  isLayerOpen,
  isTopLayer,
  layerZIndex,
  openLayer,
} from "./layer-stack";

/**
 * `useLayerStack` — K11'in kancası.
 *
 * Yığın **modül düzeyinde** yaşıyor, bir React context'inde değil. Katmanlar kabuğun üç ayrı
 * dalında açılıyor (kenar çubuğunun popover'ları, `wizards-shell`in ayarlar kaplaması,
 * `workspace-modals`ın pencereleri) ve hepsini saran ortak bir sağlayıcı yok. Context eklemek
 * kabuğun ağacını yeniden düzenlemek olurdu; harici bir store `useSyncExternalStore` ile aynı
 * işi yapıyor ve sunucuda render edilirken de boş yığını doğru veriyor.
 *
 * `Esc` dinleyicisi de **tek**: her yüzey kendi `keydown`'ını bağlasaydı üst üste iki katman
 * açıkken tuş ikisini birden kapatırdı. Dinleyici yığın boş değilken bağlanır ve yalnız en
 * üstteki katmanı kapatır.
 */

let stack: ServerLayerStack = EMPTY_LAYER_STACK;
const listeners = new Set<() => void>();

function emit(next: ServerLayerStack): void {
  if (next === stack) {
    return;
  }

  stack = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ServerLayerStack {
  return stack;
}

function getServerSnapshot(): ServerLayerStack {
  return EMPTY_LAYER_STACK;
}

/** Test ve `resetSessionUiState` için: yığını sıfırlar. */
export function resetServerLayerStack(): void {
  emit(EMPTY_LAYER_STACK);
}

export type UseLayerStackOptions = {
  /** Yüzeyin kimliği; yığındaki kaydın anahtarı. */
  id: string;
  kind: ServerLayerKind;
  /** Yüzey kapandığında çağrılır — `Esc`, dış tıklama ve üstten kapatma hepsi buradan geçer. */
  onClose: () => void;
  open: boolean;
};

export type LayerStackHandle = {
  /**
   * Kaplamaya verilecek `z-index`. Katmanın türünden gelir; bileşen kendi sayısını yazmaz.
   */
  zIndex: number;
  /** Yüzey yığında mı? Kapanış animasyonu bittikten sonra `false` olur. */
  isOpen: boolean;
  /** `Esc`, odak tuzağı ve dış tıklama yalnız en üstteki katmanındır. */
  isTop: boolean;
};

/**
 * Yüzeyi yığına bağlar.
 *
 * `open` `true` olduğunda katman açılır (ve K11'in kuralı gereği altındakileri kapatır),
 * `false` olduğunda veya bileşen sökülürken kapanır. Odak yönetimi (ilk odaklanabilir öğe,
 * kapanışta tetikleyiciye dönüş) `ui/modal.tsx`'in kendi tuzağında; bu kanca ona **hangi**
 * katmanın en üstte olduğunu söyler, çünkü tuzağı yalnız o kurmalıdır.
 */
export function useLayerStack({ id, kind, onClose, open }: UseLayerStackOptions): LayerStackHandle {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      emit(closeLayer(stack, id));
      return;
    }

    emit(openLayer(stack, { id, kind } satisfies ServerLayer));

    return () => {
      emit(closeLayer(stack, id));
    };
  }, [id, kind, open]);

  const isTop = isTopLayer(current, id);

  useEffect(() => {
    if (!open || !isTop || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const { closed } = closeTopLayer(stack);
      if (closed?.id !== id) {
        return;
      }

      event.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [id, isTop, open]);

  return {
    isOpen: isLayerOpen(current, id),
    isTop,
    zIndex: layerZIndex(kind),
  };
}

/**
 * Yığını yalnız **okuyan** yüzeyler için. Ayarlar kaplaması, üstünde pencere varken kendi
 * `Esc`'ini ve odak tuzağını bırakmak zorunda; bunu öğrenmek için katman açmasına gerek yok.
 */
export function useIsTopLayer(id: string): boolean {
  return isTopLayer(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), id);
}
