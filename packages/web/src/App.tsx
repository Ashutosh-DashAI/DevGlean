import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./store/auth.store";
import { Layout } from "./components/layout/Layout";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { Search } from "./pages/search/Search";
import { Connectors } from "./pages/connectors/Connectors";
import { Documents } from "./pages/documents/Documents";
import { Analytics } from "./pages/analytics/Analytics";
import { Settings } from "./pages/settings/Settings";
import { OSSExplorer } from "./pages/oss/OSSExplorer";

type Page = "search" | "ossExplorer" | "connectors" | "documents" | "analytics" | "settings";
type AuthPage = "login" | "register";

export function App() {
  const { isAuthenticated } = useAuthStore();
  const [currentPage, setCurrentPage] = useState<Page>("search");
  const [authPage, setAuthPage] = useState<AuthPage>("login");

  if (!isAuthenticated) {
    return authPage === "login" ? (
      <Login onSwitchToRegister={() => setAuthPage("register")} />
    ) : (
      <Register onSwitchToLogin={() => setAuthPage("login")} />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
        {currentPage === "search" && <Search />}
        {currentPage === "ossExplorer" && <OSSExplorer />}
        {currentPage === "connectors" && <Connectors />}
        {currentPage === "documents" && <Documents />}
        {currentPage === "analytics" && <Analytics />}
        {currentPage === "settings" && <Settings />}
      </Layout>
    </QueryClientProvider>
  );
}
