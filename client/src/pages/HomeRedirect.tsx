import { useEffect } from "react";
import { useLocation } from "wouter";
import { ensureAuthenticated, isAllowedRole } from "@/lib/auth";

export default function HomeRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await ensureAuthenticated();
      if (cancelled) return;

      if (!session) {
        setLocation("/login");
      } else if (!isAllowedRole(session.role)) {
        setLocation("/access-denied");
      } else {
        setLocation("/dashboard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  return null;
}
