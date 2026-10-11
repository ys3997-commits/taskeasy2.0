"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { cn, fullName } from "@/lib/utils";
import { Button } from "./ui";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks/received", label: "My Received Tasks", icon: ClipboardList },
  { href: "/tasks/delegated", label: "My Delegated Tasks", icon: CheckSquare },
  { href: "/tasks/all", label: "All Tasks", icon: ClipboardList, adminOnly: true },
  { href: "/recurring", label: "Recurring Tasks", icon: RefreshCw },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/staff", label: "Staff", icon: Users, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user?.must_change_password && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    if (!user) return;
    api
      .notifications()
      .then((res) => setUnread(res.data.filter((n) => !n.read_at).length))
      .catch(() => undefined);
  }, [user, pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 text-ink-500">
        Loading…
      </div>
    );
  }

  const items = nav.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f8_0%,#eef2f0_100%)]">
      <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-2 text-ink-700 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div>
              <p className="font-display text-xl font-semibold tracking-tight text-brand-700">
                Rajshree Energy
              </p>
              <p className="text-xs text-ink-500">Task Delegation Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-ink-600 hover:bg-ink-100"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unread > 0 ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" />
              ) : null}
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink-900">{fullName(user)}</p>
              <p className="text-xs text-ink-500">
                {user.username} · {user.role === "admin" ? "Admin" : "Staff"}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut size={16} className="mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-ink-200 bg-white p-4 pt-20 transition lg:static lg:z-0 lg:block lg:w-56 lg:shrink-0 lg:rounded-lg lg:border lg:p-3 lg:pt-3",
            open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <nav className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-ink-700 hover:bg-ink-50"
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        {open ? (
          <button
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu overlay"
          />
        ) : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
