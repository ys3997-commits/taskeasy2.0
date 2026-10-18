"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Alert, Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (username.includes("@")) {
      setError("Sign in with your username, not an email address");
      return;
    }
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      router.replace(user.must_change_password ? "/change-password" : "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#e7efe9,transparent_45%),linear-gradient(180deg,#f8faf9,#eef2f0)] px-4">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-semibold text-brand-700">
            Rajshree Energy
          </p>
          <p className="mt-2 text-sm text-ink-500">
            Sign in to the task delegation platform
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="rahul.sharma"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
