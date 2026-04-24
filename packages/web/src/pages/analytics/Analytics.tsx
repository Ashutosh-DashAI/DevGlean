import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, Clock, FileText, Cable, Search as SearchIcon, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { analyticsApi } from "../../lib/api";

interface OverviewData {
  totalQueries: number;
  avgLatencyMs: number;
  documentCount: number;
  activeConnectors: number;
  queriesThisMonth: number;
}

interface QueryVolume {
  date: string;
  count: number;
}

interface TopQuery {
  query: string;
  count: number;
  avgLatencyMs: number;
}

interface ConnectorHealthItem {
  connectorId: string;
  displayName: string;
  type: string;
  status: string;
  documentCount: number;
  successRate: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export function Analytics() {
  const { data: overview } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => analyticsApi.getOverview() as Promise<OverviewData>,
  });

  const { data: volumeData } = useQuery({
    queryKey: ["analytics", "volume"],
    queryFn: () => analyticsApi.getQueryVolume({ granularity: "day" }),
  });

  const { data: topData } = useQuery({
    queryKey: ["analytics", "top"],
    queryFn: () => analyticsApi.getTopQueries(),
  });

  const { data: healthData } = useQuery({
    queryKey: ["analytics", "health"],
    queryFn: () => analyticsApi.getConnectorHealth(),
  });

  const kpiCards = [
    { label: "Total Queries", value: overview?.totalQueries ?? 0, icon: SearchIcon, color: "var(--color-primary)" },
    { label: "Avg Latency", value: `${((overview?.avgLatencyMs ?? 0) / 1000).toFixed(1)}s`, icon: Clock, color: "var(--color-warning)" },
    { label: "Docs Indexed", value: overview?.documentCount ?? 0, icon: FileText, color: "var(--color-success)" },
    { label: "Connectors", value: overview?.activeConnectors ?? 0, icon: Cable, color: "#a78bfa" },
  ];

  const volume = (volumeData?.data ?? []) as QueryVolume[];
  const topQueries = (topData?.data ?? []) as TopQuery[];
  const connectorHealth = (healthData?.data ?? []) as ConnectorHealthItem[];

  return (
    <div style={{ padding: "40px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Analytics</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Monitor your team's knowledge graph usage</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass"
              style={{ borderRadius: "var(--radius-lg)", padding: 20 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {card.label}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: `${card.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} style={{ color: card.color }} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Query Volume Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass"
        style={{ borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <TrendingUp size={16} style={{ color: "var(--color-primary)" }} />
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Query Volume (30 days)</h2>
        </div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} stroke="var(--color-border)" tickFormatter={(val: string) => val.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} stroke="var(--color-border)" />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--color-text)" }}
                labelStyle={{ color: "var(--color-text-secondary)" }}
              />
              <Line type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--color-primary)", fill: "var(--color-base)" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Top Queries */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass" style={{ borderRadius: "var(--radius-lg)", padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Top Queries This Week</h2>
          {topQueries.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 20, textAlign: "center" }}>No queries yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topQueries.map((q, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "var(--radius-full)", background: "var(--color-primary-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "var(--color-primary)", flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>{q.count}×</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Connector Health */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass" style={{ borderRadius: "var(--radius-lg)", padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Connector Health</h2>
          {connectorHealth.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 20, textAlign: "center" }}>No connectors</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {connectorHealth.map((ch) => (
                <div key={ch.connectorId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--color-surface)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{ch.displayName}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ch.documentCount} docs</div>
                  </div>
                  <div style={{ width: 60 }}>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--color-border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${ch.successRate}%`, borderRadius: 2, background: ch.successRate >= 90 ? "var(--color-success)" : ch.successRate >= 50 ? "var(--color-warning)" : "var(--color-error)" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 2, textAlign: "right" }}>{ch.successRate}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
