import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { api, ApiError } from "../lib/api";
import { isValidEnsName, normalizeEnsName } from "../lib/validation";

export default function ProfilePage() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const lower = name.toLowerCase();

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", lower],
    queryFn: () => api.getProfile(lower),
    enabled: isValidEnsName(lower),
  });

  if (!isValidEnsName(lower)) {
    return <NotFound name={name} />;
  }

  if (isLoading) {
    return <ProfileSkeleton name={lower} />;
  }

  if (error) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status === 404) return <NotFound name={lower} />;
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-red-400">Failed to load profile.</p>
        <p className="text-xs text-zinc-500 mt-2">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-start gap-5">
        <Avatar url={data.avatar.url} fallback={data.ens_name[0]} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight break-all">
            {data.ens_name}
          </h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <code className="text-sm text-zinc-400 font-mono break-all">
              {data.address}
            </code>
            {data.reverse_verified ? (
              <span className="text-xs px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded-full">
                ✓ reverse verified
              </span>
            ) : (
              <span
                title="Address does not reverse-resolve to this name"
                className="text-xs px-2 py-0.5 bg-zinc-900 text-zinc-500 border border-zinc-800 rounded-full"
              >
                unverified
              </span>
            )}
          </div>
          {data.avatar.unrendered_reason && (
            <p className="mt-2 text-xs text-amber-400">{data.avatar.unrendered_reason}</p>
          )}
        </div>
      </div>

      <Section title="Identity" entries={data.groups.identity} linkifyKey="url" />
      <Section title="Contact" entries={data.groups.contact} linkifyKey="email" />
      <Section title="Social" entries={data.groups.social} />
      <Section title="Other records" entries={data.groups.other} mono />

      {Object.values(data.groups).every((g) => g.length === 0) && (
        <p className="mt-8 text-zinc-500 text-sm">No text records set for this name.</p>
      )}

      <HeaderSearch onSubmit={navigate} />
    </article>
  );
}

function Avatar({ url, fallback }: { url: string | null; fallback: string }) {
  const [errored, setErrored] = useState(false);
  if (url && !errored) {
    return (
      <img
        src={url}
        alt=""
        className="w-24 h-24 rounded-full object-cover border border-zinc-800 bg-zinc-900 shrink-0"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center text-2xl text-zinc-500 shrink-0">
      {fallback.toUpperCase()}
    </div>
  );
}

function Section({
  title,
  entries,
  linkifyKey,
  mono,
}: {
  title: string;
  entries: [string, string][];
  linkifyKey?: string;
  mono?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium">{title}</h2>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-2 gap-x-4 text-sm">
        {entries.map(([k, v]) => (
          <FragmentRow key={k} k={k} v={v} linkifyKey={linkifyKey} mono={mono} />
        ))}
      </dl>
    </section>
  );
}

function FragmentRow({
  k,
  v,
  linkifyKey,
  mono,
}: {
  k: string;
  v: string;
  linkifyKey?: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className={mono ? "text-zinc-500 font-mono text-xs" : "text-zinc-500 capitalize"}>
        {k}
      </dt>
      <dd className="break-words">
        {linkifyKey === k && k === "url" ? (
          <a href={v} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            {v}
          </a>
        ) : linkifyKey === "email" && (k === "email" || k === "mail") ? (
          <a href={`mailto:${v}`} className="text-blue-400 hover:underline">{v}</a>
        ) : (
          v
        )}
      </dd>
    </>
  );
}

function ProfileSkeleton({ name }: { name: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-pulse">
      <div className="flex items-start gap-5">
        <div className="w-24 h-24 rounded-full bg-zinc-900" />
        <div className="flex-1 space-y-3">
          <div className="h-8 bg-zinc-900 rounded w-2/3" />
          <div className="h-4 bg-zinc-900 rounded w-full" />
        </div>
      </div>
      <div className="mt-10 space-y-3">
        <div className="h-3 bg-zinc-900 rounded w-24" />
        <div className="h-4 bg-zinc-900 rounded w-full" />
        <div className="h-4 bg-zinc-900 rounded w-5/6" />
        <div className="h-4 bg-zinc-900 rounded w-3/4" />
      </div>
      <p className="mt-12 text-xs text-zinc-600">Reading {name} from Ethereum…</p>
    </div>
  );
}

function NotFound({ name }: { name: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Name not found</h1>
      <p className="mt-3 text-zinc-400">
        <code className="font-mono">{name}</code> doesn't resolve to an Ethereum address.
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        The name might not be registered, or it has no resolver set.
      </p>
      <Link
        to="/"
        className="mt-8 inline-block bg-white text-zinc-950 font-medium px-5 py-2.5 rounded-md hover:bg-zinc-200"
      >
        Try another name
      </Link>
    </div>
  );
}

function HeaderSearch({ onSubmit }: { onSubmit: (path: string) => void }) {
  const [value, setValue] = useState("");
  function handle(e: FormEvent) {
    e.preventDefault();
    const name = normalizeEnsName(value);
    if (isValidEnsName(name)) onSubmit(`/${name}`);
  }
  return (
    <form onSubmit={handle} className="mt-12 pt-6 border-t border-zinc-800 flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Look up another .eth name…"
        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <button className="bg-zinc-100 text-zinc-950 text-sm font-medium px-4 py-2 rounded-md hover:bg-white">
        Go
      </button>
    </form>
  );
}
