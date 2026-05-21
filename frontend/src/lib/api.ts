// API client. All requests share-origin with the Django backend (or proxied
// via Vite during dev). CSRF token comes from Django's csrftoken cookie.

export type ProfileResponse = {
  ens_name: string;
  address: string;
  reverse_verified: boolean;
  records: Record<string, string>;
  avatar: {
    url: string | null;
    kind: "https" | "ipfs" | "data" | "nft" | "unknown" | "none";
    unrendered_reason: string | null;
  };
  groups: {
    identity: [string, string][];
    contact: [string, string][];
    social: [string, string][];
    other: [string, string][];
  };
  resolved_at: string;
};

export type GraphNode = {
  data: {
    id: string;
    label: string;
    address: string;
    avatar: string;
    resolved: boolean;
  };
  position: { x: number; y: number };
};

export type GraphEdge = {
  data: { source: string; target: string; id: string };
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolved: string[];
  malformed: string[];
  node_count: number;
  edge_count: number;
};

export type FriendshipResponse = {
  a: string;
  b: string;
  created: boolean;
};

function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const isMutation = init.method && !["GET", "HEAD"].includes(init.method);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (init.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (isMutation) {
    headers["X-CSRFToken"] = getCsrfToken();
  }

  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    let message = `Request failed: HTTP ${res.status}`;
    if (data && typeof data === "object" && "error" in data) {
      const e = (data as { error: unknown }).error;
      if (typeof e === "string") message = e;
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  async getProfile(name: string): Promise<ProfileResponse> {
    return request<ProfileResponse>(`/api/profile/${encodeURIComponent(name)}/`);
  },
  async buildGraph(pairs: string): Promise<GraphResponse> {
    return request<GraphResponse>("/api/graph/", {
      method: "POST",
      body: JSON.stringify({ pairs }),
    });
  },
  async addFriendship(a: string, b: string): Promise<FriendshipResponse> {
    return request<FriendshipResponse>("/api/friendships/", {
      method: "POST",
      body: JSON.stringify({ a, b }),
    });
  },
  async removeFriendship(a: string, b: string): Promise<{ deleted: number }> {
    return request<{ deleted: number }>("/api/friendships/", {
      method: "DELETE",
      body: JSON.stringify({ a, b }),
    });
  },
  // Calling any GET endpoint primes the CSRF cookie for subsequent mutations.
  async primeCsrf(): Promise<void> {
    await fetch("/api/csrf/", { credentials: "same-origin" });
  },
};

export { ApiError };
