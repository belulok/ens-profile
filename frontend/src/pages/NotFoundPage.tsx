import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Lost in the chain</h1>
      <p className="mt-3 text-zinc-400">
        That URL doesn't match anything we recognize.
      </p>
      <Link
        to="/"
        className="mt-8 inline-block bg-white text-zinc-950 font-medium px-5 py-2.5 rounded-md hover:bg-zinc-200"
      >
        Back home
      </Link>
    </div>
  );
}
