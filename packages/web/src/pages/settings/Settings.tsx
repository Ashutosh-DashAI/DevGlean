import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Users, CreditCard, Shield, Mail, Trash2, Crown, UserCheck, UserMinus } from "lucide-react";
import { teamApi, billingApi } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

type Tab = "team" | "members" | "billing";

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("team");
  const { team, user } = useAuthStore();
  const queryClient = useQueryClient();

  const tabs = [
    { id: "team" as const, label: "Team", icon: SettingsIcon },
    { id: "members" as const, label: "Members", icon: Users },
    { id: "billing" as const, label: "Billing", icon: CreditCard },
  ];

  return (
    <div style={{ padding: "40px 32px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Settings</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Manage your team, members, and billing</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 32, borderBottom: "1px solid var(--color-border)", paddingBottom: 0 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px", border: "none", borderRadius: 0,
                borderBottom: isActive ? "2px solid var(--color-primary)" : "2px solid transparent",
                background: "transparent", cursor: "pointer",
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)",
                transition: "all 0.15s",
              }}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "team" && <TeamSettings />}
      {activeTab === "members" && <MembersSettings />}
      {activeTab === "billing" && <BillingSettings />}
    </div>
  );
}

function TeamSettings() {
  const { team } = useAuthStore();
  const [name, setName] = useState(team?.name ?? "");
  const [slug, setSlug] = useState(team?.slug ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await teamApi.update({ name, slug });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Team Information</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-base)", color: "var(--color-text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>URL slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-base)", color: "var(--color-text)", fontSize: 14, fontFamily: "var(--font-mono)", outline: "none" }} />
          </div>
          <button onClick={handleSave} disabled={saving}
            style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ borderRadius: "var(--radius-lg)", padding: 24, border: "1px solid rgba(239, 68, 68, 0.3)", background: "var(--color-error-muted)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-error)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={18} /> Danger Zone
        </h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 16 }}>
          Deleting your team will permanently remove all data including connectors, documents, and query history.
        </p>
        <button
          style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-error)", background: "transparent", color: "var(--color-error)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 6 }}>
          <Trash2 size={14} /> Delete team
        </button>
      </div>
    </div>
  );
}

function MembersSettings() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const { user } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => teamApi.getMembers(),
  });

  const inviteMutation = useMutation({
    mutationFn: () => teamApi.invite({ email: inviteEmail, role: inviteRole }),
    onSuccess: () => { setInviteEmail(""); },
  });

  const members = (data?.members ?? []) as Member[];

  const roleIcon = (role: string) => {
    if (role === "OWNER") return <Crown size={12} style={{ color: "var(--color-warning)" }} />;
    if (role === "ADMIN") return <UserCheck size={12} style={{ color: "var(--color-primary)" }} />;
    return null;
  };

  return (
    <div>
      {/* Invite form */}
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={18} /> Invite Member
        </h2>
        <div style={{ display: "flex", gap: 12 }}>
          <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com"
            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-base)", color: "var(--color-text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none" }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
            style={{ padding: "10px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-base)", color: "var(--color-text)", fontSize: 13, fontFamily: "var(--font-sans)", cursor: "pointer" }}>
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button onClick={() => inviteMutation.mutate()} disabled={!inviteEmail || inviteMutation.isPending}
            style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>
            Send Invite
          </button>
        </div>
      </div>

      {/* Members list */}
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Team Members ({members.length})</h2>
        </div>
        {members.map((member) => (
          <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border)" }}>
            <div style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "var(--color-primary)", border: "1px solid var(--color-border)" }}>
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {member.name} {roleIcon(member.role)}
                {member.id === user?.id && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>(you)</span>}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{member.email}</div>
            </div>
            <div style={{ fontSize: 12, padding: "4px 10px", borderRadius: "var(--radius-full)", background: "var(--color-surface)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
              {member.role}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingSettings() {
  const { team } = useAuthStore();

  const { data: usage } = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => analyticsApi.getUsage(),
  });

  const usageData = usage as { queriesUsed?: number; queriesLimit?: number; connectorsUsed?: number; connectorsLimit?: number } | undefined;

  const handleUpgrade = async () => {
    try {
      const result = await billingApi.createCheckout();
      window.location.href = result.checkoutUrl;
    } catch {
      // Handle error
    }
  };

  const handleManage = async () => {
    try {
      const result = await billingApi.createPortal();
      window.location.href = result.portalUrl;
    } catch {
      // Handle error
    }
  };

  return (
    <div>
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Current Plan</h2>
            <div style={{ display: "inline-flex", padding: "4px 12px", borderRadius: "var(--radius-full)", background: team?.plan === "PRO" ? "var(--color-primary-muted)" : "var(--color-surface)", color: team?.plan === "PRO" ? "var(--color-primary)" : "var(--color-text-secondary)", fontSize: 13, fontWeight: 600, border: "1px solid var(--color-border)" }}>
              {team?.plan ?? "FREE"}
            </div>
          </div>
          {team?.plan === "FREE" ? (
            <button onClick={handleUpgrade}
              style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "none", background: "linear-gradient(135deg, var(--color-primary), #38bdf8)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              Upgrade to Pro — $29/mo
            </button>
          ) : (
            <button onClick={handleManage}
              style={{ padding: "10px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              Manage Subscription
            </button>
          )}
        </div>

        {/* Usage bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Queries this month</span>
              <span style={{ color: "var(--color-text-muted)" }}>{usageData?.queriesUsed ?? 0} / {usageData?.queriesLimit ?? 1000}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-surface)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "var(--color-primary)", width: `${Math.min(100, ((usageData?.queriesUsed ?? 0) / (usageData?.queriesLimit ?? 1000)) * 100)}%`, transition: "width 0.5s ease" }} />
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Connectors</span>
              <span style={{ color: "var(--color-text-muted)" }}>{usageData?.connectorsUsed ?? 0} / {usageData?.connectorsLimit ?? 1}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--color-surface)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "var(--color-success)", width: `${Math.min(100, ((usageData?.connectorsUsed ?? 0) / (usageData?.connectorsLimit ?? 1)) * 100)}%`, transition: "width 0.5s ease" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Need to import this at the file scope
import { analyticsApi } from "../../lib/api";
