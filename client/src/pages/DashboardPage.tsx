import { useTranslation } from "react-i18next";
import { LayoutDashboard } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageTitle } from "@/components/admin/AdminPageTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  const { t } = useTranslation("common");

  return (
    <AdminLayout>
      <AdminPageTitle icon={LayoutDashboard} href="/dashboard">
        {t("nav.dashboard", { defaultValue: "Dashboard" })}
      </AdminPageTitle>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("app.name", { defaultValue: "Declare" })}</CardTitle>
          <CardDescription>
            {t("admin.login.subtitle", {
              defaultValue: "Suggestion management panel",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The dashboard is under construction.
          </p>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
