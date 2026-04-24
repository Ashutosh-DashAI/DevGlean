import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Cable, Github, MessageSquare, FileText, Ticket, Plus, RefreshCw, Pause, Play, Trash2, CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react";
import { connectorApi } from "../../lib/api";

const CONNECTOR_TYPES = [
  { type: "github", label: "GitHub", icon: Github, color: "#333", description: "Repos, issues, PRs, commits" },
  { type: "notion", label: "Notion", icon: FileText, color: "#000", description: "Pages, databases, docs" },
  { type: "slack", label: "Slack", icon: MessageSquare, color: "#4A154B", description: "Channels, threads, messages" },
  { type: "linear", label: "Linear", icon: Ticket, color: "#5E6AD2", description: "Issues, comments, projects" },
  { type: "jira", label: "Jira", icon: Ticket, color: "#0052CC", description: "Issues, comments, boards" },
];

interface ConnectorData {
  id: string;
  type: string;
  displayName: string;
  status: string;
  lastSyncStatus: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  documentCount: number;
  createdAt: string;
}

export function Connectors() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: () => connectorApi.list(),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => connectorApi.triggerSync(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connectors"] }),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => connectorApi.pause(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connectors"] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => connectorApi.resume(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connectors"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connectors"] }),
  });

  const connectors = (data?.connectors ?? []) as ConnectorData[];
  const connectedTypes = new Set(connectors.map((c) => c.type.toLowerCase()));

  const handleConnect = async (type: string) => {
    setConnecting(type);
    try {
      const result = await connectorApi.startOAuth(type);
      window.location.href = result.authUrl;
    } catch {
      setConnecting(null);
    }
  };

  const statusBadge = (status: string, syncStatus: string) => {
    const config: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
      ACTIVE: { color: "var(--color-success)", bg: "var(--color-success-muted)", icon: CheckCircle2 },
      PAUSED: { color: "var(--color-warning)", bg: "var(--color-warning-muted)", icon: Pause },
      ERROR: { color: "var(--color-error)", bg: "var(--color-error-muted)", icon: AlertCircle },
      RUNNING: { color: "var(--color-primary)", bg: "var(--color-primary-muted)", icon: Loader2 },
    };
    const cfg = config[syncStatus === "RUNNING" ? "RUNNING" : status] ?? config.ACTIVE;
    const Icon = cfg!.icon;

    return (
      <div
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: "var(--radius-full)",
          background: cfg!.bg, color: cfg!.color, fontSize: 11, fontWeight: 500,
        }}
      >
        <Icon size={12} />
        {syncStatus === "RUNNING" ? "Syncing" : status}
      </div>
    );
  };

  return (
    <div style={{ padding: "40px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Connectors
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
          Connect your data sources to build your knowledge graph
        </p>
      </div>

      {/* Connected connectors */}
      {connectors.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
            Connected
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {connectors.map((connector) => (
              <motion.div
                key={connector.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass"
                style={{ borderRadius: "var(--radius-lg)", padding: 20 }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{connector.displayName}</div>
                    {statusBadge(connector.status, connector.lastSyncStatus)}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                    {connector.documentCount} docs
                  </div>
                </div>

                {connector.lastSyncedAt && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                    <Clock size={12} />
                    Last synced: {new Date(connector.lastSyncedAt).toLocaleString()}
                  </div>
                )}

                {connector.lastSyncError && (
                  <div style={{ fontSize: 12, color: "var(--color-error)", marginBottom: 12, padding: "8px 10px", background: "var(--color-error-muted)", borderRadius: "var(--radius-sm)" }}>
                    {connector.lastSyncError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => syncMutation.mutate(connector.id)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 12, fontFamily: "var(--font-sans)" }}>
                    <RefreshCw size={12} /> Sync
                  </button>
                  {connector.status === "ACTIVE" ? (
                    <button onClick={() => pauseMutation.mutate(connector.id)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 12, fontFamily: "var(--font-sans)" }}>
                      <Pause size={12} /> Pause
                    </button>
                  ) : (
                    <button onClick={() => resumeMutation.mutate(connector.id)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 12, fontFamily: "var(--font-sans)" }}>
                      <Play size={12} /> Resume
                    </button>
                  )}
                  <button onClick={() => { if (confirm("Delete this connector? All indexed documents will be removed.")) deleteMutation.mutate(connector.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(239, 68, 68, 0.3)", background: "var(--color-error-muted)", color: "var(--color-error)", cursor: "pointer", fontSize: 12, fontFamily: "var(--font-sans)", marginLeft: "auto" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Available connector types */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>
          {connectors.length > 0 ? "Add more sources" : "Available sources"}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {CONNECTOR_TYPES.filter((ct) => !connectedTypes.has(ct.type)).map((ct) => {
            const Icon = ct.icon;
            const isConnecting = connecting === ct.type;

            return (
              <motion.button
                key={ct.type}
                onClick={() => handleConnect(ct.type)}
                disabled={isConnecting}
                whileHover={{ scale: 1.02, borderColor: "var(--color-primary)" }}
                whileTap={{ scale: 0.98 }}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "18px 20px", borderRadius: "var(--radius-lg)",
                  border: "1px dashed var(--color-border)", background: "transparent",
                  cursor: isConnecting ? "not-allowed" : "pointer",
                  textAlign: "left", fontFamily: "var(--font-sans)",
                  color: "var(--color-text)", transition: "all 0.2s",
                  opacity: isConnecting ? 0.6 : 1,
                }}
              >
                <div
                  style={{
                    width: 40, height: 40, borderRadius: "var(--radius-md)",
                    background: "var(--color-surface)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <Icon size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ct.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{ct.description}</div>
                </div>
                <Plus size={16} style={{ color: "var(--color-text-muted)" }} />
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
