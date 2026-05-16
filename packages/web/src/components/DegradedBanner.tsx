import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function DegradedBanner({ message }: { message: string }) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        width: "auto",
        maxWidth: 600,
        padding: "12px 20px",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-warning)",
        color: "#000",
        border: "1px solid rgba(0,0,0,0.1)",
        boxShadow: "var(--shadow-xl)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "var(--font-sans)",
      }}
    >
      <AlertCircle size={18} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={() => setIsVisible(false)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(0,0,0,0.6)",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        Dismiss
      </button>
    </motion.div>
  );
}
