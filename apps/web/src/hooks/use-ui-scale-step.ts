"use client";

import { useEffect, useState } from "react";
import { selectUiScale, type UiScaleValue } from "@/lib/home/scale";

/**
 * Ölçek adımını **okuyan** hook — Ana Sayfa'nın içerik yoğunluğu (SPEC §8.3) buna bağlı.
 *
 * `use-ui-scale.ts` yazıcıdır, React state tutmaz ve tek çağrı noktası vardır; bu okuyucudur ve
 * DOM'a hiçbir şey yazmaz. Ayrı dosyalar, çünkü yazıcının sözleşmesi tam olarak "state yok"tur
 * (Faz 1) — okuyucu state tutmak zorunda.
 *
 * Adımı köke bakarak değil, aynı saf fonksiyonu (`selectUiScale`) çağırarak bulur: iki okuyucu
 * arasında yarış olmaz ve hidrasyon sırasında kökte henüz bir değer yokken de doğru cevap verir.
 *
 * Sunucuda ve ilk boyada taban adım (×1) döner; adım değişimi nadir olduğu için `resize`
 * `requestAnimationFrame` ile daraltılır ve state yalnız adım gerçekten değiştiğinde yazılır —
 * aksi halde her piksel altı sorgu birden tetiklerdi.
 */
export function useUiScaleStep(): UiScaleValue {
  const [scale, setScale] = useState<UiScaleValue>(1);

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      const next = selectUiScale({ height: window.innerHeight, width: window.innerWidth }).scale;
      setScale((current) => (current === next ? current : next));
    };

    const handleResize = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };

    sync();
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return scale;
}
