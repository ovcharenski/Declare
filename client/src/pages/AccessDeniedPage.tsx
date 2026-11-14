import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { getSession, clearSession, ROLE_LABELS } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { GlassHeader } from "@/components/GlassHeader";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function AccessDeniedPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const session = getSession();
  const roleLabel =
    ROLE_LABELS[session?.role ?? ""] ?? session?.role ?? "unknown";

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-background p-4 pt-16 relative"
      data-testid="access-denied-screen"
    >
      <GlassHeader />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,0,0,0.05),transparent_50%)]" />

      <div className="max-w-md w-full text-center relative z-10 p-8 border border-destructive/20 rounded-xl bg-card shadow-[0_0_50px_rgba(255,0,0,0.05)]">
        <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="font-display text-3xl font-bold text-foreground mb-3 tracking-tight">
          {t("admin.accessDenied.title", { defaultValue: "Access Denied" })}
        </h1>

        <p className="text-muted-foreground mb-8">
          {t("admin.accessDenied.message", {
            defaultValue:
              "Your role does not have permission to access the Declare panel. This area is restricted to administrators.",
          })}{" "}
          <span className="font-mono text-foreground bg-secondary px-2 py-0.5 rounded text-sm">
            {roleLabel}
          </span>
        </p>

        <Button
          variant="outline"
          className="mx-auto flex items-center gap-2 border-border hover:bg-secondary"
          onClick={() => {
            clearSession();
            setLocation("/login");
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          {t("admin.accessDenied.tryAgain", {
            defaultValue: "Try a different account",
          })}
        </Button>
      </div>
    </div>
  );
}
