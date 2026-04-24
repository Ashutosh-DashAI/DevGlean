import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Search,
  Star,
  GitPullRequest,
  MessageSquare,
  ThumbsUp,
  Code,
  Sparkles,
  Activity,
  TrendingUp,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface OSSIssue {
  id: string;
  title: string;
  body: string;
  htmlUrl: string;
  repoFullName: string;
  repoStars: number;
  reactionCount: number;
  commentCount: number;
  linkedPRMerged: boolean;
  hasCodeBlock: boolean;
  issueScore: number;
  source: "github" | "stackoverflow";
  closedAt: string | null;
  labels: string[];
  author: string;
}

interface CacheStatus {
  hitRate: number;
  totalEntries: number;
  rateLimitRemaining: number;
}

export function OSSExplorer() {
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<OSSIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<OSSIssue | null>(null);
  const [synthesis, setSynthesis] = useState<{
    problem: string;
    solution: string;
    codeExamples: string[];
  } | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [language, setLanguage] = useState("");

  const handleSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setSelectedIssue(null);
    setSynthesis(null);

    try {
      const res = await fetch("/api/v1/oss/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          filters: language ? { language } : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues ?? []);
        setCacheHit(data.cacheHit ?? false);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleSynthesize = async (issue: OSSIssue) => {
    const match = issue.htmlUrl.match(
      /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/
    );
    if (!match) return;

    setSynthesizing(true);
    try {
      const res = await fetch(
        `/api/v1/oss/issue/${match[1]}/${match[2]}/${match[3]}/synthesize`,
        { method: "POST" }
      );
      if (res.ok) {
        setSynthesis(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setSynthesizing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "#10B981";
    if (score >= 0.4) return "#F59E0B";
    return "#6B7280";
  };

  const getSourceBadge = (source: "github" | "stackoverflow") => {
    if (source === "stackoverflow") {
      return { bg: "#F48024", label: "Stack Overflow" };
    }
    return { bg: "#10B981", label: "GitHub" };
  };

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, #10B981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Globe size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
              OSS Explorer
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              Search resolved issues across all of GitHub + Stack Overflow
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ flex: 1, position: "relative" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-muted)",
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="How did the React community fix hydration mismatch errors?"
            style={{
              width: "100%",
              padding: "12px 14px 12px 42px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
          />
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            padding: "0 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
            minWidth: 120,
          }}
        >
          <option value="">All Languages</option>
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
          <option value="java">Java</option>
        </select>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "0 24px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "linear-gradient(135deg, #10B981, #059669)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-sans)",
          }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Search OSS
        </motion.button>
      </div>

      {/* Cache Status Banner */}
      {cacheHit && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            marginBottom: 16,
            borderRadius: "var(--radius-md)",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            fontSize: 13,
            color: "#10B981",
          }}
        >
          <Activity size={14} />
          Served from cache — instant results
        </motion.div>
      )}

      {/* Results Grid */}
      <div style={{ display: "flex", gap: 24 }}>
        {/* Issue List */}
        <div style={{ flex: 1 }}>
          <AnimatePresence mode="wait">
            {issues.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {issues.map((issue, i) => {
                  const badge = getSourceBadge(issue.source);
                  const isSelected = selectedIssue?.id === issue.id;

                  return (
                    <motion.div
                      key={issue.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        setSelectedIssue(issue);
                        setSynthesis(null);
                      }}
                      style={{
                        padding: 16,
                        borderRadius: "var(--radius-lg)",
                        border: `1px solid ${isSelected ? "#10B981" : "var(--color-border)"}`,
                        background: isSelected
                          ? "rgba(16, 185, 129, 0.05)"
                          : "var(--color-surface)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {/* Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 4,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "var(--radius-full)",
                                background: badge.bg,
                                color: "#fff",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {badge.label}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {issue.repoFullName}
                            </span>
                          </div>
                          <h3
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              margin: 0,
                              color: "var(--color-text)",
                              lineHeight: 1.4,
                            }}
                          >
                            {issue.title}
                          </h3>
                        </div>

                        {/* Score Badge */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            minWidth: 48,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: getScoreColor(issue.issueScore),
                            }}
                          >
                            {(issue.issueScore * 100).toFixed(0)}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: "var(--color-text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            score
                          </div>
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          fontSize: 12,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Star size={12} /> {issue.repoStars.toLocaleString()}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <ThumbsUp size={12} /> {issue.reactionCount}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <MessageSquare size={12} /> {issue.commentCount}
                        </span>
                        {issue.linkedPRMerged && (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#10B981",
                            }}
                          >
                            <GitPullRequest size={12} /> Merged PR
                          </span>
                        )}
                        {issue.hasCodeBlock && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Code size={12} /> Has code
                          </span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!loading && issues.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: 64,
                color: "var(--color-text-muted)",
              }}
            >
              <Globe size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                Search the world's open-source knowledge
              </p>
              <p style={{ fontSize: 13, maxWidth: 400, margin: "0 auto" }}>
                Find resolved issues, merged PRs, and accepted answers from GitHub and Stack Overflow.
              </p>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedIssue && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              style={{
                width: 420,
                flexShrink: 0,
                padding: 20,
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                maxHeight: "calc(100vh - 200px)",
                overflowY: "auto",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                  {selectedIssue.title}
                </h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    marginBottom: 12,
                  }}
                >
                  <span>{selectedIssue.repoFullName}</span>
                  <span>·</span>
                  <span>by @{selectedIssue.author}</span>
                </div>

                {/* Labels */}
                {selectedIssue.labels.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 12,
                    }}
                  >
                    {selectedIssue.labels.slice(0, 5).map((label) => (
                      <span
                        key={label}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          background: "var(--color-base-alt)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Body preview */}
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.6,
                    maxHeight: 200,
                    overflow: "hidden",
                    marginBottom: 16,
                  }}
                >
                  {selectedIssue.body.slice(0, 500)}
                  {selectedIssue.body.length > 500 && "..."}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSynthesize(selectedIssue)}
                    disabled={synthesizing}
                    style={{
                      flex: 1,
                      padding: "10px 16px",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {synthesizing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Synthesize Solution
                  </motion.button>
                  <a
                    href={selectedIssue.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                      background: "transparent",
                      color: "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* Synthesis result */}
              <AnimatePresence>
                {synthesis && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: 16,
                      padding: 16,
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-base-alt)",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#8B5CF6",
                      }}
                    >
                      <Sparkles size={14} />
                      AI Synthesis
                    </div>

                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <h4
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--color-text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 4,
                        }}
                      >
                        Problem
                      </h4>
                      <p style={{ margin: "0 0 12px", color: "var(--color-text)" }}>
                        {synthesis.problem}
                      </p>

                      <h4
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--color-text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 4,
                        }}
                      >
                        Solution
                      </h4>
                      <p style={{ margin: "0 0 12px", color: "var(--color-text)" }}>
                        {synthesis.solution}
                      </p>

                      {synthesis.codeExamples.length > 0 && (
                        <>
                          <h4
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--color-text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              marginBottom: 4,
                            }}
                          >
                            Code
                          </h4>
                          {synthesis.codeExamples.map((code, i) => (
                            <pre
                              key={i}
                              style={{
                                background: "var(--color-base)",
                                padding: 12,
                                borderRadius: "var(--radius-sm)",
                                fontSize: 12,
                                overflow: "auto",
                                marginBottom: 8,
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              <code>{code}</code>
                            </pre>
                          ))}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
