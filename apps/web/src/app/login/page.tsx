"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const MOCK_EMAIL = "superadmin@shivatex.in";
  const MOCK_PASSWORD = "shivatex@12345";
  const shouldUseMock = process.env.NODE_ENV === "development";

  const [email, setEmail] = useState(shouldUseMock ? MOCK_EMAIL : "");
  const [password, setPassword] = useState(shouldUseMock ? MOCK_PASSWORD : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const doLogin = async () => {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          credentials: "include",
        });
        const contentType = res.headers.get("content-type") ?? "";
        const data =
          contentType.includes("application/json")
            ? await res.json()
            : ({} as Record<string, unknown>);
        return { res, data };
      };

      let { res, data } = await doLogin();
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 2000));
        ({ res, data } = await doLogin());
      }
      if (!res.ok) {
        const rawMsg =
          typeof (data as Record<string, unknown>)?.error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Login failed";
        setError(
          res.status === 503
            ? "Service is starting up. Please wait a moment and try again."
            : rawMsg
        );
        return;
      }
      queryClient.removeQueries({ queryKey: ["auth", "me"] });
      queryClient.removeQueries({ queryKey: ["dashboard"] });
      queryClient.removeQueries({ queryKey: ["orders"] });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white md:flex-row">

      {/* ── Left: Hero panel ── */}
      <div className="hidden md:flex md:w-[52%] lg:w-[55%] flex-col bg-[#F2EDE8] px-10 py-8 lg:px-16 lg:py-12">

        {/* Top brand bar */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm overflow-hidden">
            <Image src="/company-logo.png" alt="Logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-900">Shivatex Yarn Limited</p>
            <p className="text-[11px] text-slate-500 leading-tight">Enquiry Management System</p>
          </div>
        </div>

        {/* Centre: logo card + headline */}
        <div className="flex flex-1 flex-col justify-center gap-8">
          {/* Logo card */}
          <div className="w-[160px] h-[160px] rounded-2xl bg-white/70 flex items-center justify-center shadow-sm border border-white/60">
            <Image src="/company-logo.png" alt="Company Logo" width={110} height={110} className="object-contain" />
          </div>

          {/* Headline block */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600 mb-4">
              Enquiry Management System
            </p>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 lg:text-6xl">
              Manage<br />Every<br />
              <span className="text-indigo-600">Enquiry.</span>
            </h1>
            <p className="mt-5 text-slate-500 text-base leading-relaxed max-w-sm">
              Track, transfer, and manage all enquiries across divisions — from initial contact to final closure.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {["SLA Tracking", "Division Transfers", "Audit Logs", "Role Access", "Notifications"].map((f) => (
              <span
                key={f}
                className="rounded-full border border-slate-300/70 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-slate-600"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: Sign-in form ── */}
      <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-10 md:px-12 lg:px-16">

        {/* Mobile brand */}
        <div className="mb-8 flex items-center gap-3 md:hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-200 overflow-hidden">
            <Image src="/company-logo.png" alt="Logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-900">Shivatex Yarn Limited</p>
            <p className="text-[11px] text-slate-500">Enquiry Management System</p>
          </div>
        </div>

        <div className="w-full max-w-[400px]">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to your account to continue
          </p>

          <form onSubmit={onSubmit} className="mt-9 space-y-5">
            {error && (
              <div role="alert" className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@shivatex.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-shadow"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                  tabIndex={-1}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-indigo-600 text-white text-sm font-semibold tracking-wide hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-slate-400">
            Shivatex Yarn Limited · EMS
          </p>
        </div>
      </div>
    </div>
  );
}
