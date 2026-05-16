import React, { useState, useEffect } from "react";
import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { DegradedBanner } from "../DegradedBanner";
import { apiClient } from "../lib/api";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [isDegraded, setIsDegraded] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await apiClient.get("/health/deep");
        if (res.data.checks?.embedding?.status === "degraded") {
          setIsDegraded(true);
        } else {
          setIsDegraded(false);
        }
      } catch (err) {
        // Keep current state on failure
      }
    };

    // Poll every 30s
    const interval = setInterval(checkHealth, 30000);
    checkHealth();

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--color-base)",
        }}
      >
        {isDegraded && (
          <DegradedBanner
            message="Search is running in reduced-accuracy mode. Results use keyword matching only. Vector search will restore automatically."
          />
        )}
        {children}
      </main>
    </div>
  );
}
