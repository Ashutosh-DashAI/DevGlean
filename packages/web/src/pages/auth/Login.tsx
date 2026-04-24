import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { authApi } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

interface LoginProps {
  onSwitchToRegister: () => void;
}

export function Login({ onSwitchToRegister }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await authApi.login({ email, password });
      const user = result.user as { id: string; email: string; name: string; role: string; avatarUrl: string | null };
      const team = result.team as { id: string; name: string; slug: string; plan: string };
      setAuth(user, team, result.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-base)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background gradient orbs */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(14, 165, 233, 0.08), transparent 70%)",
          top: -200,
          right: -200,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.06), transparent 70%)",
          bottom: -100,
          left: -100,
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 40,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--color-primary), #a78bfa)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={22} color="#fff" />
          </div>
          <span
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}
            className="gradient-text"
          >
            DevGlean
          </span>
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 8,
            color: "var(--color-text)",
          }}
        >
          Welcome back
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "var(--color-text-muted)",
            fontSize: 14,
            marginBottom: 32,
          }}
        >
          Sign in to your knowledge graph
        </p>

        {/* Card */}
        <div
          className="glass"
          style={{
            borderRadius: "var(--radius-xl)",
            padding: 24,
          }}
        >
          <form onSubmit={handleSubmit}>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{
                  background: "var(--color-error-muted)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontSize: 13,
                  color: "var(--color-error)",
                }}
              >
                {error}
              </motion.div>
            )}

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--color-text-muted)",
                  }}
                />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 38px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-base)",
                    color: "var(--color-text)",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--color-text-muted)",
                  }}
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 40px 10px 38px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-base)",
                    color: "var(--color-text)",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                background: "linear-gradient(135deg, var(--color-primary), #38bdf8)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: loading ? 0.7 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight size={16} />}
            </motion.button>
          </form>
        </div>

        {/* Switch to register */}
        <p
          style={{
            textAlign: "center",
            marginTop: 24,
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}
        >
          Don't have an account?{" "}
          <button
            onClick={onSwitchToRegister}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-primary)",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: 13,
              fontFamily: "var(--font-sans)",
            }}
          >
            Create one
          </button>
        </p>
      </motion.div>
    </div>
  );
}
