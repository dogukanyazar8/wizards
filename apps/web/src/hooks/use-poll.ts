"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyPollVote, type PollDTO } from "@wizards/types";

import { castPollVote, clearPollVote, fetchPoll } from "@/lib/messages/screen-client";
import { useSocket } from "@/hooks/use-socket";

/**
 * Anket oy durumu — SPEC-MESAJLAR §5.5, karar #1.
 *
 * Kart saf kalsın diye üç iş buraya alındı: iyimser güncelleme, uçuş hâlindeki
 * isteğin iptali ve `poll:updated` yükünün iyimser durumu ezmesi.
 *
 * **Son istek kazanır.** Hızlı ardışık tıklama üst üste istek doğurur ve
 * sunucudan dönüş sırası gönderim sırasıyla aynı değildir; iptal edilmeseydi
 * eski bir yanıt yeni oyu geri alabilirdi. `AbortController` önceki isteği
 * keser, `requestSeqRef` de kesilmemiş ama geç dönen bir yanıtı eler.
 */

export type UsePollOptions = {
  /** Sunucudan gelen anket; `poll:updated` bunu tazeler. */
  poll: PollDTO;
};

export type UsePollResult = {
  /** Karta verilecek anket — iyimser durum varsa o. */
  poll: PollDTO;
  /** Uçuşta bir istek var mı. */
  isVoting: boolean;
  /** Son istek başarısızsa `true`; yeni tıklamada temizlenir. */
  hasError: boolean;
  toggleOption: (optionId: string) => void;
};

export function usePoll({ poll }: UsePollOptions): UsePollResult {
  const socket = useSocket();
  const [optimistic, setOptimistic] = useState<PollDTO | null>(null);
  const [serverPoll, setServerPoll] = useState<PollDTO>(poll);
  const [propPoll, setPropPoll] = useState<PollDTO>(poll);
  const [isVoting, setIsVoting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  /**
   * Sunucu yükü **her zaman** iyimser durumu bırakır. Bırakmasaydı, başka birinin
   * oyuyla gelen güncelleme kendi iyimser satırımızın altında kalır ve kart
   * gerçeğe hiç dönmezdi.
   *
   * Sıfırlama render sırasında yapılıyor, efektte değil: efektten `setState`
   * çağırmak fazladan bir render turu doğurur ve kart bir kare boyunca bayat
   * durumu çizerdi. React'in `props` değişiminde durum düzeltme kalıbı bu.
   */
  if (poll !== propPoll) {
    setPropPoll(poll);
    setServerPoll(poll);
    setOptimistic(null);
  }

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const handleUpdated = (event: { pollId: string }) => {
      if (event.pollId !== poll.id) {
        return;
      }

      void fetchPoll(poll.id)
        .then((nextPoll) => {
          setServerPoll(nextPoll);
          setOptimistic(null);
        })
        .catch(() => undefined);
    };

    socket.on("poll:updated", handleUpdated);
    return () => {
      socket.off("poll:updated", handleUpdated);
    };
  }, [poll.id, socket]);

  const toggleOption = useCallback(
    (optionId: string) => {
      const current = optimistic ?? serverPoll;
      const next = applyPollVote(current, optionId);

      setOptimistic(next);
      setHasError(false);
      setIsVoting(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;

      // Boş küme "oyumu geri çek" demek. Ayrı bir uç, çünkü boş bir `PUT`
      // gövdesi sunucuda "hiçbir şey seçme" ile "seçimi sil" arasında ayrım
      // bırakmazdı.
      const request =
        next.myOptionIds.length === 0
          ? clearPollVote(poll.id, controller.signal)
          : castPollVote(poll.id, next.myOptionIds, controller.signal);

      void request
        .then((server) => {
          if (seq !== requestSeqRef.current) {
            return;
          }

          setServerPoll(server);
          setOptimistic(null);
          setIsVoting(false);
        })
        .catch(() => {
          if (seq !== requestSeqRef.current) {
            return;
          }

          // Geri alma: iyimser durum düşer, kart sunucunun bildiği hâle döner.
          setOptimistic(null);
          setHasError(true);
          setIsVoting(false);
        });
    },
    [optimistic, poll.id, serverPoll],
  );

  return { hasError, isVoting, poll: optimistic ?? serverPoll, toggleOption };
}
