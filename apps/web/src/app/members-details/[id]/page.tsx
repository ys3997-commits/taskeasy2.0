"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/** Old member overview URL — send admins back to the list. */
export default function MemberDetailsRedirectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/dashboard");
      return;
    }
    router.replace(`/members-details#${params.id}`);
  }, [user, loading, router, params.id]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 text-ink-500">
      Loading…
    </div>
  );
}
