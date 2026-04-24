import { useAuthStore } from "../store/auth.store";

const API_BASE = "/api/v1";

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      useAuthStore.getState().clearAuth();
      return null;
    }

    const data = (await response.json()) as { accessToken: string };
    useAuthStore.getState().setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    useAuthStore.getState().clearAuth();
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Auto-refresh on 401
  if (response.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    throw new ApiError(
      response.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? "Request failed",
      body.error?.details
    );
  }

  return response.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────

export const authApi = {
  register: (body: { email: string; password: string; name: string; teamName: string }) =>
    apiFetch<{ user: Record<string, unknown>; team: Record<string, unknown>; accessToken: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(body) }
    ),

  login: (body: { email: string; password: string }) =>
    apiFetch<{ user: Record<string, unknown>; team: Record<string, unknown>; accessToken: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(body) }
    ),

  logout: () =>
    apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" }),
};

// ─── Search ─────────────────────────────────────────────────────────────

export const searchApi = {
  search: (body: { query: string; filters?: Record<string, unknown>; stream?: boolean }) =>
    apiFetch<{ answer: string; sources: unknown[]; latencyMs: number; queryId: string }>(
      "/search",
      { method: "POST", body: JSON.stringify({ ...body, stream: false }) }
    ),

  getHistory: (params?: { page?: number; limit?: number; q?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.q) searchParams.set("q", params.q);
    return apiFetch<{ items: unknown[]; total: number; page: number; totalPages: number }>(
      `/search/history?${searchParams}`
    );
  },

  submitFeedback: (queryId: string, body: { helpful: boolean }) =>
    apiFetch<{ success: boolean }>(`/search/${queryId}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getSuggestions: (q?: string) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    return apiFetch<{ suggestions: string[] }>(`/search/suggestions${params}`);
  },
};

// ─── Connectors ─────────────────────────────────────────────────────────

export const connectorApi = {
  list: () =>
    apiFetch<{ connectors: unknown[] }>("/connectors"),

  get: (id: string) =>
    apiFetch<Record<string, unknown>>(`/connectors/${id}`),

  startOAuth: (type: string) =>
    apiFetch<{ authUrl: string; state: string }>(`/connectors/${type}/oauth/start`, {
      method: "POST",
    }),

  completeOAuth: (type: string, body: { code: string; state: string }) =>
    apiFetch<{ connector: Record<string, unknown> }>(`/connectors/${type}/oauth/callback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/connectors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/connectors/${id}`, { method: "DELETE" }),

  triggerSync: (id: string) =>
    apiFetch<{ jobId: string }>(`/connectors/${id}/sync`, { method: "POST" }),

  pause: (id: string) =>
    apiFetch<{ success: boolean }>(`/connectors/${id}/pause`, { method: "POST" }),

  resume: (id: string) =>
    apiFetch<{ success: boolean }>(`/connectors/${id}/resume`, { method: "POST" }),

  getJobs: (id: string) =>
    apiFetch<{ jobs: unknown[] }>(`/connectors/${id}/jobs`),
};

// ─── Teams ──────────────────────────────────────────────────────────────

export const teamApi = {
  get: () =>
    apiFetch<Record<string, unknown>>("/teams"),

  update: (body: { name?: string; slug?: string }) =>
    apiFetch<Record<string, unknown>>("/teams", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getMembers: () =>
    apiFetch<{ members: unknown[] }>("/teams/members"),

  invite: (body: { email: string; role?: string }) =>
    apiFetch<{ inviteId: string; inviteUrl: string }>("/teams/members/invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  removeMember: (userId: string) =>
    apiFetch<{ success: boolean }>(`/teams/members/${userId}`, { method: "DELETE" }),

  updateRole: (userId: string, body: { role: string }) =>
    apiFetch<{ success: boolean }>(`/teams/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

// ─── Documents ──────────────────────────────────────────────────────────

export const documentApi = {
  list: (params?: { page?: number; connectorId?: string; sourceType?: string; q?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.connectorId) searchParams.set("connectorId", params.connectorId);
    if (params?.sourceType) searchParams.set("sourceType", params.sourceType);
    if (params?.q) searchParams.set("q", params.q);
    return apiFetch<{ items: unknown[]; total: number; page: number; totalPages: number }>(
      `/documents?${searchParams}`
    );
  },

  get: (id: string) =>
    apiFetch<Record<string, unknown>>(`/documents/${id}`),

  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/documents/${id}`, { method: "DELETE" }),
};

// ─── Analytics ──────────────────────────────────────────────────────────

export const analyticsApi = {
  getOverview: () =>
    apiFetch<Record<string, unknown>>("/analytics/overview"),

  getQueryVolume: (params?: { granularity?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.granularity) searchParams.set("granularity", params.granularity);
    return apiFetch<{ data: unknown[] }>(`/analytics/queries?${searchParams}`);
  },

  getTopQueries: () =>
    apiFetch<{ data: unknown[] }>("/analytics/queries/top"),

  getConnectorHealth: () =>
    apiFetch<{ data: unknown[] }>("/analytics/connectors/health"),

  getUsage: () =>
    apiFetch<Record<string, unknown>>("/analytics/usage"),
};

// ─── Billing ────────────────────────────────────────────────────────────

export const billingApi = {
  get: () =>
    apiFetch<Record<string, unknown>>("/billing"),

  createCheckout: () =>
    apiFetch<{ checkoutUrl: string }>("/billing/checkout", { method: "POST" }),

  createPortal: () =>
    apiFetch<{ portalUrl: string }>("/billing/portal", { method: "POST" }),

  cancelSubscription: () =>
    apiFetch<{ success: boolean }>("/billing/subscription", { method: "DELETE" }),
};

// ─── SSE Streaming ──────────────────────────────────────────────────────

export function createSearchStream(
  query: string,
  onToken: (token: string) => void,
  onSources: (sources: unknown[]) => void,
  onDone: (data: { queryId: string; latencyMs: number }) => void,
  onError: (error: string) => void
): AbortController {
  const controller = new AbortController();
  const { accessToken } = useAuthStore.getState();

  fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, stream: true }),
    signal: controller.signal,
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        onError(err.error?.message ?? "Search failed");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);

          try {
            const event = JSON.parse(jsonStr) as {
              event: string;
              data: unknown;
            };

            switch (event.event) {
              case "token":
                onToken(event.data as string);
                break;
              case "sources":
                onSources(event.data as unknown[]);
                break;
              case "done":
                onDone(event.data as { queryId: string; latencyMs: number });
                break;
              case "error":
                onError(event.data as string);
                break;
            }
          } catch {
            // Skip malformed SSE events
          }
        }
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

export { ApiError };
