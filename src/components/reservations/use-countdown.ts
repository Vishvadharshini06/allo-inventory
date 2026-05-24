// src/components/reservations/use-countdown.ts
"use client";

import { useEffect, useState } from "react";
import { getSecondsRemaining } from "@/lib/utils";

export function useCountdown(expiresAt: string | Date) {
  const [seconds, setSeconds] = useState(() => getSecondsRemaining(expiresAt));

  useEffect(() => {
    setSeconds(getSecondsRemaining(expiresAt));
    const interval = setInterval(() => {
      const remaining = getSecondsRemaining(expiresAt);
      setSeconds(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return {
    seconds,
    expired: seconds <= 0,
    urgent: seconds > 0 && seconds < 120,
  };
}
