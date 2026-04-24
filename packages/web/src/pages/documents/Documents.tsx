import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Search, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { documentApi } from "../../lib/api";

interface DocumentItem {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string;
  chunkIndex: number;
  chunkTotal: number;
  connectorName: string;
  updatedAt: string;
}

export function Documents() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["documents", page, searchQuery, sourceFilter],
    queryFn: () =>
      documentApi.list({
        page,
        q: searchQuery || undefined,
        sourceType: sourceFilter || undefined,
      }),
  });

  const items = (data?.items ?? []) as DocumentItem[];
  const totalPages = data?.totalPages ?? 1;

  const connectorIcon = (type: string) => {
    const icons: Record<string, string> = { GITHUB: "🐙", NOTION: "📝", SLACK: "💬", LINEAR: "📐", JIRA: "🎫" };
    return icons[type] ?? "📄";
  };

  return (
    <div style={{ padding: "40px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Documents</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Browse and search your indexed knowledge base</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
          <input
            id="doc-search"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search documents…"
            style={{
              width: "100%", padding: "10px 12px 10px 38px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)", background: "var(--color-surface)",
              color: "var(--color-text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none",
            }}
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          style={{
            padding: "10px 16px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)", background: "var(--color-surface)",
            color: "var(--color-text)", fontSize: 13, fontFamily: "var(--font-sans)", cursor: "pointer",
          }}
        >
          <option value="">All sources</option>
          <option value="GITHUB">GitHub</option>
          <option value="NOTION">Notion</option>
          <option value="SLACK">Slack</option>
          <option value="LINEAR">Linear</option>
          <option value="JIRA">Jira</option>
        </select>
      </div>

      {/* Document list */}
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 100px 120px", gap: 16, padding: "12px 20px", borderBottom: "1px solid var(--color-border)", fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <div>Title</div>
          <div>Source</div>
          <div>Connector</div>
          <div>Chunks</div>
          <div>Updated</div>
        </div>

        {/* Rows */}
        {items.map((doc, i) => (
          <motion.a
            key={doc.id}
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            style={{
              display: "grid", gridTemplateColumns: "1fr 120px 100px 100px 120px", gap: 16,
              padding: "14px 20px", borderBottom: "1px solid var(--color-border)",
              textDecoration: "none", transition: "background 0.15s",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <FileText size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {doc.title}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
              {connectorIcon(doc.sourceType)} {doc.sourceType}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{doc.connectorName}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{doc.chunkIndex + 1}/{doc.chunkTotal}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {new Date(doc.updatedAt).toLocaleDateString()}
            </div>
          </motion.a>
        ))}

        {items.length === 0 && !isLoading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)", fontSize: 14 }}>
            No documents found
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 4, opacity: page === 1 ? 0.5 : 1 }}>
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ display: "flex", alignItems: "center", fontSize: 13, color: "var(--color-text-muted)", padding: "0 12px" }}>
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 4, opacity: page === totalPages ? 0.5 : 1 }}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
