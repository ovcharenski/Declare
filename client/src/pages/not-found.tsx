import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GlassHeader } from "@/components/GlassHeader";

export default function NotFound() {
  const { t } = useTranslation("common");

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 pt-16 relative">
      <GlassHeader />
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-display font-bold text-foreground">
              {t("notFound.title")}
            </h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t("notFound.description")}
          </p>

          <Button asChild className="mt-6" variant="outline">
            <Link href="/dashboard">
              {t("admin.notFound.back", { defaultValue: "Back to panel" })}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
