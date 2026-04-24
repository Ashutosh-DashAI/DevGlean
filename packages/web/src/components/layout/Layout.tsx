import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: "search" | "ossExplorer" | "connectors" | "documents" | "analytics" | "settings") => void;
}

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--color-base)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
