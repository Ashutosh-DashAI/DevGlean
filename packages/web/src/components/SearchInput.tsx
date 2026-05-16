import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search as SearchIcon } from "lucide-react";
import { apiClient } from "../lib/api";

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  onSearch: () => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get(`/search/suggestions?q=${encodeURIComponent(value)}`);
        setSuggestions(res.data.suggestions);
        setIsOpen(res.data.suggestions.length > 0);
      } catch (err) {
        console.error("Suggestions fetch failed", err);
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <SearchIcon
          size={18}
          style={{
            position: "absolute",
            left: 16,
            color: "var(--color-text-muted)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={placeholder}
          disabled={disabled}
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
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: "absolute",
              top: "calc(100% - 10px)",
              left: 0,
              right: 0,
              zIndex: 100,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-xl)",
              overflow: "hidden",
              padding: "8px",
            }}
          >
            {suggestions.map((suggestion, i) => (
              <div
                key={i}
                onClick={() => {
                  onChange(suggestion);
                  setIsOpen(false);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--color-text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                } }
              >
                <SearchIcon size={14} style={{ color: "var(--color-text-muted)" }} />
                {suggestion}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
