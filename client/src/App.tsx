import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/auth/RequireAuth";
import LoginPage from "@/pages/LoginPage";
import AccessDeniedPage from "@/pages/AccessDeniedPage";
import DashboardPage from "@/pages/DashboardPage";
import HomeRedirect from "@/pages/HomeRedirect";
import NotFound from "@/pages/not-found";
import "./lib/i18n";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={LoginPage} />
      <Route path="/access-denied" component={AccessDeniedPage} />
      <Route path="/dashboard">
        <RequireAuth>
          <DashboardPage />
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
