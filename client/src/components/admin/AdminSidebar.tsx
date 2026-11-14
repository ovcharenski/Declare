import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  MessageSquareText,
  Users,
  Tags,
  ScrollText,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { appVersion } from "@/lib/appVersion";
import { clearSession, getSession, isMockMode } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  fallback: string;
  icon: React.ComponentType<{ className?: string }>;
  testId: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "admin.sidebar.dashboard",
    fallback: "Dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    href: "/suggestions",
    label: "admin.sidebar.suggestions",
    fallback: "Suggestions",
    icon: MessageSquareText,
    testId: "nav-suggestions",
  },
  {
    href: "/users",
    label: "admin.sidebar.users",
    fallback: "Users",
    icon: Users,
    testId: "nav-users",
  },
  {
    href: "/tags",
    label: "admin.sidebar.tags",
    fallback: "Tags",
    icon: Tags,
    testId: "nav-tags",
  },
  {
    href: "/audit",
    label: "admin.sidebar.audit",
    fallback: "Audit",
    icon: ScrollText,
    testId: "nav-audit",
  },
  {
    href: "/settings",
    label: "admin.sidebar.settings",
    fallback: "Settings",
    icon: Settings,
    testId: "nav-settings",
  },
];

export function AdminSidebar() {
  const { t } = useTranslation("common");
  const [location, setLocation] = useLocation();
  const session = getSession();

  const versionLabel = `v${appVersion}`;

  const handleLogout = async () => {
    if (!isMockMode) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        /* session cookie cleared best-effort */
      }
    }
    clearSession();
    setLocation("/login");
  };

  return (
    <Sidebar className="z-40 top-[var(--admin-header-height)] bottom-auto h-[calc(100svh-var(--admin-header-height))] [&_[data-sidebar=sidebar]]:bg-[hsl(0_0%_2.5%)]">
      <SidebarContent className="site-scrollbar pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location === item.href ||
                      location.startsWith(`${item.href}/`)
                    }
                    data-testid={item.testId}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.label, { defaultValue: item.fallback })}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        {session && (
          <div
            className="flex items-center gap-2.5 min-w-0"
            data-testid="sidebar-account"
          >
            <div
              className="h-9 w-9 shrink-0 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground"
              aria-hidden
            >
              {(session.displayName ?? session.username).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium text-foreground truncate leading-tight"
                data-testid="sidebar-display-name"
              >
                {session.displayName ?? session.username}
              </p>
              <p
                className="text-xs text-muted-foreground font-mono truncate leading-tight mt-0.5"
                data-testid="sidebar-username"
              >
                @{session.username}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
              data-testid="logout-button"
              aria-label={t("admin.sidebar.logout", { defaultValue: "Log out" })}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/80 px-0.5">
          <span>by ovcharenski</span>
          <span className="font-mono tabular-nums">{versionLabel}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
