"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CheckSquare,
  ClipboardList,
  Clock,
  Contact,
  Eraser,
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

const nav: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  danger?: boolean;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks/received", label: "Assigned Task", icon: ClipboardList },
  { href: "/tasks/delegated", label: "Delegated Tasks", icon: CheckSquare },
  { href: "/recurring", label: "Recurring Tasks", icon: RefreshCw },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/staff", label: "Team member", icon: Users, adminOnly: true },
  {
    href: "/members-details",
    label: "Members Details",
    icon: Contact,
    adminOnly: true,
  },
  { href: "/time-tracking", label: "Time Tracking", icon: Clock, adminOnly: true },
  {
    href: "/tasks/clear-completed",
    label: "Clear Finished Tasks",
    icon: Eraser,
    adminOnly: true,
    danger: true,
  },
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
    let cancelled = false;

    function loadUnread() {
      api
        .unreadNotificationCount()
        .then((res) => {
          if (!cancelled) setUnread(res.count);
        })
        .catch(() => undefined);
    }

    loadUnread();
    const onFocus = () => loadUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  useEffect(() => {
    if (!user || pathname !== "/notifications") return;
    api
      .unreadNotificationCount()
      .then((res) => setUnread(res.count))
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
  const sideNav = pathname === "/dashboard";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f8_0%,#eef2f0_100%)]">
      <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/90 backdrop-blur">
        <div
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-3",
            sideNav ? "mx-auto max-w-7xl" : "lg:px-6"
          )}
        >
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
                {user.role === "admin" ? "Admin" : "Team"}
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
        {sideNav ? null : (
          <nav className="hidden border-t border-ink-100 lg:block">
            <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 lg:px-6">
              <ShellNav
                items={items}
                pathname={pathname}
                layout="bar"
                onNavigate={() => setOpen(false)}
              />
            </div>
          </nav>
        )}
      </header>

      {sideNav ? (
        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-200 bg-white p-4 pt-20 transition lg:static lg:z-0 lg:block lg:w-56 lg:shrink-0 lg:rounded-lg lg:border lg:p-3 lg:pt-3",
              open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}
          >
            <nav className="space-y-1">
              <ShellNav
                items={items}
                pathname={pathname}
                layout="drawer"
                onNavigate={() => setOpen(false)}
              />
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
      ) : (
        <>
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-200 bg-white p-4 pt-20 transition lg:hidden",
              open ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <nav className="space-y-1">
              <ShellNav
                items={items}
                pathname={pathname}
                layout="drawer"
                onNavigate={() => setOpen(false)}
              />
            </nav>
          </aside>
          {open ? (
            <button
              className="fixed inset-0 z-30 bg-black/20 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close menu overlay"
            />
          ) : null}
          <main className="min-w-0 px-4 py-4 lg:px-6">{children}</main>
        </>
      )}
    </div>
  );
}

function ShellNav({
  items,
  pathname,
  layout,
  onNavigate,
}: {
  items: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    adminOnly?: boolean;
    danger?: boolean;
  }[];
  pathname: string;
  layout: "bar" | "drawer";
  onNavigate: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 text-sm transition",
              layout === "bar"
                ? "whitespace-nowrap rounded-md px-3 py-1.5"
                : "rounded-md px-3 py-2",
              item.danger && layout === "drawer" && "mt-3 border-t border-ink-100 pt-4",
              item.danger && layout === "bar" && "ml-1 border-l border-ink-200 pl-3",
              item.danger
                ? active
                  ? "bg-red-50 font-medium text-red-800"
                  : "text-red-800 hover:bg-red-50"
                : active
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-ink-700 hover:bg-ink-50"
            )}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
