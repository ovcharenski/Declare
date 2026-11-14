import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { setSession, isAllowedRole, isMockMode, type Session } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const [role, setRole] = useState("operator");
  const [loading, setLoading] = useState(false);

  const loginError = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("error");
  }, []);

  const handleLogin = () => {
    if (!isMockMode) {
      window.location.href = "/api/auth/vare/login";
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const session: Session = {
        vareId: "usr_1",
        username: "jane-doe",
        displayName: "Jane Doe",
        email: "jane@example.com",
        role,
        roleBadge: role,
      };

      setSession(session);

      if (isAllowedRole(role)) {
        setLocation("/dashboard");
      } else {
        setLocation("/access-denied");
      }
      setLoading(false);
    }, 400);
  };

  const errorMessage =
    loginError === "denied"
      ? t("admin.login.errorDenied", {
          defaultValue: "Sign-in was cancelled or denied.",
        })
      : loginError === "oauth"
        ? t("admin.login.errorOauth", {
            defaultValue: "Vare sign-in failed. Try again.",
          })
        : null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />
      <Card className="w-full max-w-md relative z-10 border-border bg-[hsl(0_0%_2%)] shadow-sm">
        <CardHeader className="text-center pb-8 pt-10">
          <div className="mx-auto mb-8 flex items-center justify-center">
            <img
              src="/logo.svg"
              alt="Declare"
              className="h-14 w-14 object-contain"
            />
          </div>
          <CardTitle className="font-display text-3xl mb-2 tracking-tight">
            {t("admin.login.title", { defaultValue: "Declare" })}
          </CardTitle>
          <CardDescription className="text-muted-foreground font-mono">
            {t("admin.login.subtitle", {
              defaultValue: "Suggestion management panel",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pb-10">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {isMockMode && (
            <div className="space-y-2">
              <Label
                htmlFor="role"
                className="text-xs uppercase text-muted-foreground tracking-wider font-mono"
              >
                {t("admin.login.rolePicker", {
                  defaultValue: "Dev Role Picker (Mock)",
                })}
              </Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger
                  id="role"
                  data-testid="role-picker"
                  className="bg-input border-border font-mono text-sm"
                >
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">
                    operator (
                    {t("admin.login.allowed", { defaultValue: "Allowed" })})
                  </SelectItem>
                  <SelectItem value="moderator">
                    moderator (
                    {t("admin.login.allowed", { defaultValue: "Allowed" })})
                  </SelectItem>
                  <SelectItem value="global_admin">
                    global_admin (
                    {t("admin.login.allowed", { defaultValue: "Allowed" })})
                  </SelectItem>
                  <SelectItem value="tsar">
                    tsar (
                    {t("admin.login.allowed", { defaultValue: "Allowed" })})
                  </SelectItem>
                  <SelectItem value="user">
                    user (
                    {t("admin.login.denied", { defaultValue: "Denied" })})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            className="w-full bg-[hsl(165_45%_50%)] hover:bg-[hsl(165_45%_50%)]/90 text-white font-medium h-12 text-md no-default-hover-elevate transition-all active:scale-[0.98]"
            onClick={handleLogin}
            disabled={loading}
            data-testid="login-button"
          >
            {loading
              ? t("admin.login.authenticating", {
                  defaultValue: "Authenticating...",
                })
              : t("admin.login.signIn", {
                  defaultValue: "Sign in with Vare",
                })}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
