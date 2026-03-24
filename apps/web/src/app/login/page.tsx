"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left: Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] bg-slate-50 border-r border-slate-100 flex-col justify-between p-12 xl:p-16">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-slate-900" />
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              Enquiry Management
            </span>
          </div>
        </div>
        <div>
          <h2 className="text-3xl xl:text-4xl font-semibold text-slate-900 tracking-tight max-w-md">
            Enterprise enquiry workflow with SLA, audit, and full control.
          </h2>
          <p className="mt-4 text-slate-500 max-w-sm text-base">
            Sign in to manage enquiries, divisions, and compliance—all in one place.
          </p>
        </div>
        <p className="text-sm text-slate-400">© Enquiry Management System</p>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-10">
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
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-slate-900 focus-visible:ring-2"
              />
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
