import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ensureAuthenticated, getSession, isAllowedRole } from "@/lib/auth";

function hasValidSession(): boolean {
  const session = getSession();
  if (!session || !isAllowedRole(session.role)) return false;
  return true;
}

type Props = {
  children: React.ReactNode;
};

export function RequireAuth({ children }: Props) {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(hasValidSession);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    (async () => {
      const session = await ensureAuthenticated();
      if (cancelled) return;

      if (!session) {
        setLocation("/login");
        return;
      }
      if (!isAllowedRole(session.role)) {
        setLocation("/access-denied");
        return;
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, setLocation]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
