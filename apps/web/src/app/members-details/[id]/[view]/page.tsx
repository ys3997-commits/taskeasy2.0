"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

function RedirectToBox() {
  const router = useRouter();
  const params = useParams<{ id: string; view: string }>();
  const searchParams = useSearchParams();

  useEffect(() => {
    const side = params.view === "delegated" ? "delegated" : "assigned";
    const status = searchParams.get("status") || "pending";
    const qs = new URLSearchParams({
      side,
      status,
      member: params.id,
    });
    router.replace(`/members-details?${qs.toString()}`);
  }, [params.id, params.view, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500">
      Loading…
    </div>
  );
}

export default function MemberBoxRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500">
          Loading…
        </div>
      }
    >
      <RedirectToBox />
    </Suspense>
  );
}
