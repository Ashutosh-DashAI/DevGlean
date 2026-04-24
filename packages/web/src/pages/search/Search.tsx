import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon, Sparkles, ExternalLink, ThumbsUp, ThumbsDown, Clock, Command } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { createSearchStream, searchApi } from "../../lib/api";

const EXAMPLE_QUERIES = [
  "Why did we migrate from REST to GraphQL?",
  "What's the retry policy for the payment service?",
  "Who designed the notification system architecture?",
  "How does the caching layer handle invalidation?",
  "What were the trade-offs in choosing PostgreSQL over MongoDB?",
];

interface Source {
  index: number;
  title: string;
  sourceUrl: string;
  sourceType: string;
  score: string;
}

export function Search() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const answerEndRef = useRef<HTMLDivElement>(null);

  // Cycle placeholder text
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % EXAMPLE_QUERIES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-scroll answer
  useEffect(() => {
    if (isStreaming) {
      answerEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [answer, isStreaming]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim() || isStreaming) return;

      // Reset state
      setAnswer("");
      setSources([]);
      setError("");
      setQueryId(null);
      setLatencyMs(null);
      setIsStreaming(true);

      // Abort previous search
      abortRef.current?.abort();

      const controller = createSearchStream(
        query,
        (token) => setAnswer((prev) => prev + token),
        (newSources) => setSources(newSources as Source[]),
        (data) => {
          setQueryId(data.queryId);
          setLatencyMs(data.latencyMs);
          setIsStreaming(false);
        },
        (errMsg) => {
          setError(errMsg);
          setIsStreaming(false);
        }
      );

      abortRef.current = controller;
    },
    [query, isStreaming]
  );

  const handleFeedback = async (helpful: boolean) => {
    if (!queryId) return;
    await searchApi.submitFeedback(queryId, { helpful });
  };

  const connectorIcon = (type: string) => {
    const icons: Record<string, string> = {
      GITHUB: "🐙",
      NOTION: "📝",
      SLACK: "💬",
      LINEAR: "📐",
      JIRA: "🎫",
      CONFLUENCE: "📚",
      GITLAB: "🦊",
    };
    return icons[type] ?? "📄";
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "0 24px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      {/* Hero area when empty */}
      {!answer && !isStreaming && !error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 120,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "var(--radius-xl)",
              background: "var(--color-primary-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Sparkles size={28} color="var(--color-primary)" />
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 8,
              letterSpacing: "-0.03em",
            }}
            className="gradient-text"
          >
            Ask your codebase anything
          </h1>
          <p
            style={{
              color: "var(--color-text-muted)",
              textAlign: "center",
              fontSize: 15,
              maxWidth: 480,
              lineHeight: 1.6,
            }}
          >
            DevGlean searches across your GitHub repos, Notion docs, Slack threads,
            and tickets — then gives you a grounded, cited answer.
          </p>
        </motion.div>
      )}

      {/* Answer area */}
      {(answer || isStreaming || error) && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingTop: 40,
            paddingBottom: 140,
          }}
        >
          {/* Query bubble */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                background: "var(--color-primary-muted)",
                border: "1px solid rgba(14, 165, 233, 0.2)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 18px",
                maxWidth: "70%",
                fontSize: 14,
                fontFamily: "var(--font-mono)",
                color: "var(--color-primary-hover)",
              }}
            >
              {query}
            </div>
          </motion.div>

          {/* Answer card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass"
            style={{
              borderRadius: "var(--radius-xl)",
              padding: 24,
              marginBottom: 20,
            }}
          >
            {error ? (
              <div style={{ color: "var(--color-error)", fontSize: 14 }}>{error}</div>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown>{answer}</ReactMarkdown>
                {isStreaming && (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 18,
                      background: "var(--color-primary)",
                      borderRadius: 2,
                      verticalAlign: "text-bottom",
                      marginLeft: 2,
                    }}
                  />
                )}
              </div>
            )}
            <div ref={answerEndRef} />

            {/* Metadata bar */}
            {!isStreaming && answer && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                {latencyMs !== null && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <Clock size={12} />
                    {(latencyMs / 1000).toFixed(1)}s
                  </div>
                )}
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {sources.length} source{sources.length !== 1 ? "s" : ""}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleFeedback(true)}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <ThumbsUp size={12} /> Helpful
                  </button>
                  <button
                    onClick={() => handleFeedback(false)}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    <ThumbsDown size={12} />
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Sources panel */}
          <AnimatePresence>
            {sources.length > 0 && !isStreaming && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: 0.2 }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 12,
                  }}
                >
                  Sources
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sources.map((source) => (
                    <motion.a
                      key={source.index}
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: source.index * 0.05 }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        textDecoration: "none",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-primary)";
                        e.currentTarget.style.background = "var(--color-surface-hover)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border)";
                        e.currentTarget.style.background = "var(--color-surface)";
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "var(--radius-sm)",
                          background: "var(--color-warning-muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {connectorIcon(source.sourceType)}
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
                          [Source {source.index}] {source.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                          {source.sourceType} · Score: {source.score}
                        </div>
                      </div>
                      <ExternalLink size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                    </motion.a>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Search bar (pinned to bottom) */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          padding: "16px 0 24px",
          background: "linear-gradient(transparent, var(--color-base) 20%)",
        }}
      >
        <form onSubmit={handleSearch}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <SearchIcon
              size={18}
              style={{
                position: "absolute",
                left: 16,
                color: "var(--color-text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              id="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={EXAMPLE_QUERIES[placeholderIndex]}
              disabled={isStreaming}
              style={{
                width: "100%",
                padding: "16px 120px 16px 46px",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: 15,
                fontFamily: "var(--font-sans)",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxShadow: "var(--shadow-lg)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--color-primary)";
                e.target.style.boxShadow = "var(--shadow-glow)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--color-border)";
                e.target.style.boxShadow = "var(--shadow-lg)";
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <kbd
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 4,
                  background: "var(--color-base)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Command size={10} />K
              </kbd>
              <motion.button
                type="submit"
                disabled={isStreaming || !query.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  cursor: isStreaming || !query.trim() ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  background: "var(--color-primary)",
                  color: "#fff",
                  opacity: isStreaming || !query.trim() ? 0.5 : 1,
                }}
              >
                {isStreaming ? "Thinking…" : "Ask"}
              </motion.button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
