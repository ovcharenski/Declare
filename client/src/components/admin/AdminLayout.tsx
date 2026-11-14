import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";

export const ADMIN_HEADER_HEIGHT = "3.5rem"; // h-14

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      className="flex h-svh w-full flex-col overflow-hidden"
      style={
        { "--admin-header-height": ADMIN_HEADER_HEIGHT } as React.CSSProperties
      }
    >
      <header className="glass-header z-50 flex h-14 shrink-0 items-center gap-3 px-4">
        <SidebarTrigger className="-ml-1" data-testid="sidebar-trigger" />
        <img
          src="/logo.svg"
          alt="Declare"
          className="h-8 w-8 object-contain"
        />
        <span className="font-display font-semibold text-sm tracking-tight">
          Declare
        </span>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AdminSidebar />
        <SidebarInset className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="site-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-6">
              {children}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
