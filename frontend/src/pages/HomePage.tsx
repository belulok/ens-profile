import { Suspense, lazy, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { isValidEnsName, normalizeEnsName } from "../lib/validation";

// Lazy-load the Three.js wave so the rest of the page paints immediately.
const ParticleWave = lazy(() => import("../components/ParticleWave"));

export default function HomePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = normalizeEnsName(value);
    if (!isValidEnsName(name)) {
      setError(`"${value}" is not a valid .eth name.`);
      return;
    }
    navigate(`/${encodeURIComponent(name)}`);
  }

  return (
    <div className="relative -mt-[73px] min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Wave fills the screen behind everything */}
      <Suspense fallback={null}>
        <ParticleWave />
      </Suspense>

      {/* Foreground content */}
      <div className="relative z-10 w-full max-w-2xl text-center px-4 pt-20 sm:pt-24">
        <h1 className="text-4xl sm:text-7xl font-semibold tracking-tight text-gradient leading-[1.05]">
          Every <span className="font-mono italic">.eth</span> name,<br />
          read straight from chain.
        </h1>
        <p className="mt-5 sm:mt-6 text-zinc-400 text-base sm:text-lg max-w-xl mx-auto">
          Resolve any ENS name. Visualize the social graph between names.
          Persist edges as friendships.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-10 sm:mt-12 flex flex-col sm:flex-row gap-2 max-w-lg mx-auto"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="vitalik.eth"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-md px-4 py-3 text-base sm:text-lg focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600 min-w-0"
          />
          <button
            type="submit"
            className="bg-white text-zinc-950 font-medium px-6 py-3 rounded-md hover:bg-zinc-200 transition-colors whitespace-nowrap"
          >
            Look up
          </button>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}

        <div className="mt-8 text-sm text-zinc-500 flex items-center justify-center gap-x-3 gap-y-1 flex-wrap">
          <span>Try:</span>
          {["vitalik.eth", "nick.eth", "ens.eth"].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => navigate(`/${n}`)}
              className="text-zinc-400 hover:text-white underline-offset-4 hover:underline"
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
