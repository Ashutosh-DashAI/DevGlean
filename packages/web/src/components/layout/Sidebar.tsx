import { motion } from "framer-motion";
import {
  Search,
  Globe,
  Cable,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Zap,
} from "lucide-react";
import { useAuthStore } from "../../store/auth.store";
import { authApi } from "../../lib/api";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: "search" | "ossExplorer" | "connectors" | "documents" | "analytics" | "settings") => void;
}

const navItems = [
  { id: "search" as const, label: "Search", icon: Search },
  { id: "ossExplorer" as const, label: "OSS Explorer", icon: Globe },
  { id: "connectors" as const, label: "Connectors", icon: Cable },
  { id: "documents" as const, label: "Documents", icon: FileText },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { user, team, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Continue logout even if API call fails
    }
    clearAuth();
  };

  return (
    <aside
      style={{
        width: 240,
        height: "100vh",
        background: "var(--color-base-alt)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 12px",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 8px",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--color-primary), #a78bfa)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
          }}
        >
          <Zap size={18} />
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
          className="gradient-text"
        >
          DevGlean
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1 }}>
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;

          return (
            <motion.button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                color: isActive
                  ? "var(--color-primary)"
                  : "var(--color-text-secondary)",
                background: isActive
                  ? "var(--color-primary-muted)"
                  : "transparent",
                transition: "all 0.15s ease",
                marginBottom: 2,
                fontFamily: "var(--font-sans)",
                position: "relative",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 20,
                    borderRadius: "var(--radius-full)",
                    background: "var(--color-primary)",
                  }}
                />
              )}
              <Icon size={18} />
              {item.label}
            </motion.button>
          );
        })}
      </nav>

      {/* User section */}
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user?.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {team?.name} · {team?.plan}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--color-text-muted)",
            background: "transparent",
            fontFamily: "var(--font-sans)",
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
