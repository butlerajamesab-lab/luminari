import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

const DEFAULT_POST_LOGIN_PATH = "/sovereign-control";
const PUBLIC_ENTRY_PATH = "/lighthouse";

function getSafeRedirectPath(): string {
  if (typeof window === "undefined") return DEFAULT_POST_LOGIN_PATH;

  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");

  if (!redirect) return DEFAULT_POST_LOGIN_PATH;

  // Keep redirects internal-only so login cannot become an open redirect.
  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }

  return redirect;
}

function isInteractiveLoginRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("interactive") === "1";
}

export default function Login() {
  const [, navigate] = useLocation();
  const interactiveLogin = isInteractiveLoginRequested();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interactiveLogin) {
      navigate(PUBLIC_ENTRY_PATH, { replace: true });
    }
  }, [interactiveLogin, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    navigate(getSafeRedirectPath(), { replace: true });
  };

  // The default login route is now a public-entry bridge. The credential form
  // only renders when a user explicitly chose a sign-in action.
  if (!interactiveLogin) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <form onSubmit={handleSignIn} className="w-full max-w-sm p-8 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">Luminari</h1>
        <p className="text-sm text-slate-400 text-center">Sign in to continue</p>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
