"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, CheckCircle2, XCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [tokenValid, setTokenValid] = useState<boolean | null>(null); // null = checking
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate the token on mount
  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { valid?: boolean }) => setTokenValid(Boolean(d.valid)))
      .catch(() => setTokenValid(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      // Auto-redirect to login after 3 seconds
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-5">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <Image src="/company-logo.png" alt="Company Logo" width={40} height={40} className="object-contain" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-slate-900">Enquiry Management</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">

          {/* ── Checking token ── */}
          {tokenValid === null && (
            <div className="text-center py-8 space-y-3">
              <div className="h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-500">Verifying your reset link…</p>
            </div>
          )}

          {/* ── Expired / invalid token ── */}
          {tokenValid === false && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-200">
                  <XCircle className="h-7 w-7 text-red-500" />
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Link expired or invalid</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                This password reset link has expired or already been used.
                Reset links are valid for <strong className="text-slate-700">1 hour</strong>.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block mt-2 w-full text-center h-11 leading-[44px] rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Request a new reset link
              </Link>
              <Link href="/login" className="block text-sm text-slate-500 hover:text-slate-900 transition-colors mt-2">
                Back to sign in
              </Link>
            </div>
          )}

          {/* ── Success ── */}
          {success && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Password updated!</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your password has been changed successfully. A confirmation email has been sent to you.
                Redirecting to sign in…
              </p>
              <Link
                href="/login"
                className="inline-block mt-2 w-full text-center h-11 leading-[44px] rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Sign in now
              </Link>
            </div>
          )}

          {/* ── Reset form ── */}
          {tokenValid === true && !success && (
            <>
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <KeyRound className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Set new password</h1>
                  <p className="mt-1 text-sm text-slate-500">Must be at least 8 characters.</p>
                </div>
              </div>

              {error && (
                <div role="alert" className="mb-5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
                {/* New password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 font-medium text-sm">
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      required
                      autoComplete="new-password"
                      autoFocus
                      className="h-11 rounded-xl border-slate-200 bg-white pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-600 focus-visible:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-amber-600">At least 8 characters required.</p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-slate-700 font-medium text-sm">
                    Confirm new password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                      required
                      autoComplete="new-password"
                      className={`h-11 rounded-xl bg-white pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 ${
                        passwordsMismatch
                          ? "border-red-300 focus-visible:ring-red-400"
                          : passwordsMatch
                            ? "border-emerald-300 focus-visible:ring-emerald-400"
                            : "border-slate-200 focus-visible:ring-indigo-600"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordsMismatch && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Passwords do not match.
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={loading || passwordsMismatch || password.length < 8}
                >
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() needs it in Next.js App Router
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
