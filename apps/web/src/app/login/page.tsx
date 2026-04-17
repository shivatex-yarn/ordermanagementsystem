"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  // Dev-only mock credentials so you can test UI without relying on Neon DB connectivity.
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
      // If DB is temporarily unavailable, do one quick retry so users don't need to click twice.
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 900));
        ({ res, data } = await doLogin());
      }
      if (!res.ok) {
        const msg =
          typeof (data as Record<string, unknown>)?.error === "string"
            ? String((data as Record<string, unknown>).error)
            : "Login failed";
        setError(msg);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white md:flex-row">
      {/* Left: Branding */}
      <div className="hidden md:flex md:w-[46%] lg:w-1/2 xl:w-[55%] flex-col justify-between border-slate-100 bg-slate-100/80 p-8 md:border-r md:bg-slate-50 lg:p-12 xl:p-16">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900" />
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              Enquiry Management
            </span>
          </div>
        </div>
        <div>
          <h2 className="max-w-md text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl xl:text-4xl">
            Enterprise enquiry workflow with SLA, audit, and full control.
          </h2>
          <p className="mt-4 text-slate-500 max-w-sm text-base">
            Sign in to manage enquiries, divisions, and compliance—all in one place.
          </p>
        </div>
        <p className="text-sm text-slate-400">© Enquiry Management System</p>
      </div>

      {/* Right: Form */}
      <div className="flex w-full flex-1 items-center justify-center p-5 sm:p-8 md:w-[54%] md:p-10 lg:w-1/2 lg:p-12 xl:w-[45%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 md:hidden">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-slate-900" />
              <span className="text-xl font-semibold tracking-tight text-slate-900">
                Enquiry Management
              </span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-slate-500 text-base">
            Enter your credentials to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-10 space-y-6">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3"
              >
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-slate-700 font-medium text-sm"
              >
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-900 focus-visible:ring-2"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-slate-700 font-medium text-sm"
                >
                  Password
                </Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 rounded-xl border-slate-200 bg-white pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-900 focus-visible:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base font-medium bg-slate-900 hover:bg-slate-800 text-white"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            Secure access. Your data is protected.
          </p>
        </div>
      </div>
    </div>
  );
}
