import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

const DEFAULT_MEMBER_PATH = "/welcome";
const DEFAULT_ADMIN_PATH = "/sovereign-control";
const PUBLIC_ENTRY_PATH = "/lighthouse";

function getSafeRedirectPath(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  // Redirects must remain on the Lighthouse origin.
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) {
    return fallback;
  }
  return redirect;
}

function isInteractiveLoginRequested(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("interactive") === "1";
}

function getInitialMode(): "signin" | "signup" {
  if (typeof window === "undefined") return "signin";
  return new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
}

export default function Login() {
  const [, navigate] = useLocation();
  const interactiveLogin = isInteractiveLoginRequested();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"signin" | "signup">(getInitialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bootstrap = trpc.auth.bootstrap.useMutation();

  useEffect(() => {
    if (!interactiveLogin) {
      navigate(PUBLIC_ENTRY_PATH, { replace: true });
    }
  }, [interactiveLogin, navigate]);

  const changeMode = (nextMode: "signin" | "signup") => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setNotice("Check your email for a confirmation link, then sign in. If you arrived with an invitation, return to that link after confirming.");
          return;
        }
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signinError) throw signinError;
      }

      // Self-registration is not complete until the owned Lighthouse
      // profile exists. The server derives identity from the verified
      // session and assigns 'user' / 'free' to new profiles.
      const profile = await bootstrap.mutateAsync();
      await utils.auth.me.invalidate();
      const fallback = profile.role === "admin" ? DEFAULT_ADMIN_PATH : DEFAULT_MEMBER_PATH;
      navigate(getSafeRedirectPath(fallback), { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Account access failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!interactiveLogin) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
        <h1 className="text-2xl font-bold text-white text-center">Luminari</h1>
        <p className="text-sm text-slate-400 text-center">
          {mode === "signup" ? "Create your free account" : "Sign in to continue"}
        </p>
        {error && <p role="alert" className="text-sm text-red-400 text-center">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-300 text-center">{notice}</p>}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          aria-label="Email"
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        <input
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === "signup" ? "Password (at least 8 characters)" : "Password"}
          aria-label="Password"
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
        />
        {mode === "signup" && (
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm password"
            aria-label="Confirm password"
            className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium disabled:opacity-50"
        >
          {busy ? "Please wait..." : mode === "signup" ? "Create Account" : "Sign In"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => changeMode(mode === "signup" ? "signin" : "signup")}
          className="w-full text-sm text-teal-300 hover:text-teal-200 disabled:opacity-50"
        >
          {mode === "signup" ? "Already have an account? Sign In" : "New to Luminari? Create an Account"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/lighthouse")}
          className="w-full text-xs text-slate-400 hover:text-slate-200"
        >
          Explore Lighthouse without signing in
        </button>
      </form>
    </div>
  );
}
