"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CircleAlert,
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
  { href: "/tasks/overdue", label: "Overdue Tasks", icon: CircleAlert, adminOnly: true },
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
  { href: "/time-tracking", label: "Time Tracking", icon: Clock },
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

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (user?.must_change_password && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [user, loading, router, pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

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
      <header className="sticky top-0 z-50 border-b border-ink-200/80 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div
          className={cn(
            "shell-pad flex items-center justify-between gap-2 py-2 sm:gap-4 sm:py-3",
            sideNav && "mx-auto max-w-7xl"
          )}
        >
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-700 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-brand-700 sm:text-xl">
                Rajshree Energy
              </p>
              <p className="truncate text-[11px] text-ink-500 sm:text-xs">
                Task Delegation Platform
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink-900">{fullName(user)}</p>
              <p className="text-xs text-ink-500">
                {user.role === "admin" ? "Admin" : "Team"}
              </p>
            </div>
            <Button
              variant="secondary"
              className="px-2.5 sm:px-3.5"
              aria-label="Log out"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut size={16} className="sm:mr-1.5" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
        {sideNav ? null : (
          <nav className="hidden border-t border-ink-100 lg:block">
            <div className="shell-pad flex flex-wrap items-center gap-1 py-2">
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
        <div className="shell-pad mx-auto flex max-w-7xl gap-4 py-4 sm:gap-6 sm:py-6">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto overscroll-contain border-r border-ink-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] transition lg:static lg:z-0 lg:block lg:w-56 lg:shrink-0 lg:overflow-visible lg:rounded-lg lg:border lg:p-3 lg:pt-3",
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
              "fixed inset-y-0 left-0 z-40 w-[min(18rem,88vw)] overflow-y-auto overscroll-contain border-r border-ink-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] transition lg:hidden",
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
          <main className="shell-main min-w-0 py-4">{children}</main>
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
                : "min-h-11 rounded-md px-3 py-2.5",
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
