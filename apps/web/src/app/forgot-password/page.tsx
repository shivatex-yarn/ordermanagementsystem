"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

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
          {sent ? (
            /* ── Success state ── */
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                </div>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Check your inbox</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                If <strong className="text-slate-700">{email}</strong> is registered, we&apos;ve sent a password
                reset link. It expires in <strong className="text-slate-700">1 hour</strong>.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Didn&apos;t receive it? Check your spam folder, or{" "}
                <button
                  type="button"
                  className="text-slate-600 underline hover:text-slate-900 transition-colors"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  try again
                </button>
                .
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            /* ── Request form ── */
            <>
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <Mail className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Forgot your password?</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter your work email and we&apos;ll send you a reset link.
                  </p>
                </div>
              </div>

              {error && (
                <div role="alert" className="mb-5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium text-sm">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    required
                    autoComplete="email"
                    autoFocus
                    className="h-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-indigo-600 focus-visible:ring-2"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={loading}
                >
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
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
