import { Outlet, Link, createRootRoute, HeadContent, Scripts, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, Settings, LogOut } from "lucide-react";
import { BottomTabBar, SideNav } from "@/components/AppNav";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useCareCircle } from "@/hooks/useCareCircle";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useNewMemberAlert } from "@/hooks/useNewMemberAlert";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useRealtimeSyncHealth } from "@/lib/realtimeSyncStore";
import { useAnyHookLoading } from "@/lib/routeReadiness";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { usePreferences } from "@/hooks/usePreferences";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import appCss from "../styles.css?url";

// Routes that bypass the auth guard (no login required)
const PUBLIC_ROUTES = ["/login", "/register", "/join", "/reset-password", "/privacy"];
// Routes that require auth but NOT a care circle yet
const SHELL_FREE_ROUTES = ["/login", "/register", "/onboarding", "/join", "/reset-password", "/privacy"];
// Routes where the bottom medical-advice disclaimer should be rendered.
// Kept intentionally short — the disclaimer is most meaningful on the main
// landing surface (My Day) and the AI-processing surface (Scan AVS).
// Other tabs render without a footer to keep the UI calm.
const DISCLAIMER_ROUTES = ["/", "/scan"];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0a0b" },
      { title: "CareSync — Coordinated Care, Simplified" },
      {
        name: "description",
        content:
          "CareSync helps families and caregivers coordinate medications, appointments, and updates in one calm, focused place.",
      },
      { property: "og:title", content: "CareSync" },
      { property: "og:description", content: "Coordinated care for the people you love." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/logo-icon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/logo-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AppHeader() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : "…";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <img src="/logo-icon.png" alt="CareSync" className="h-7 w-7 rounded-lg object-cover" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.2))" }} />
        <span className="text-base font-semibold tracking-tight">CareSync</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id="header-user-menu"
            className="h-7 w-7 overflow-hidden rounded-full ring-2 ring-background transition-opacity hover:opacity-80"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-accent text-xs font-semibold text-foreground">
                {initials}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function Disclaimer() {
  return (
    <p className="px-4 py-3 text-center text-[11px] leading-relaxed text-muted-foreground/80">
      CareSync is an administrative organizational tool, not a substitute for professional medical
      advice.
    </p>
  );
}

/**
 * DeferredRouteContent — wraps Outlet and AnimatePresence to keep the
 * new route's content invisible (opacity 0) until all of its data hooks
 * report ready via the global routeReadiness store. Once ready, fades in.
 *
 * Why: the previous implementation faded in the new route immediately on
 * mount, exposing skeleton/loading states and any leftover paint frames
 * from the previous route. Users described this as "remnant artifacts"
 * and "messy transitions."
 *
 * Behaviour:
 *   - Old route exits quickly (60ms fade-out) so the gap is small
 *   - New route mounts at opacity 0
 *   - As soon as no hook reports loading, new fades in (180ms)
 *   - Safety: a max-wait (800ms) reveals new even if a hook stays stuck
 *     loading, so the UI is never permanently blank
 */
function DeferredRouteContent({ path }: { path: string }) {
  const isLoading = useAnyHookLoading();
  // Always start hidden. Effects control the reveal once data is ready.
  // This prevents a single-frame flash of unloaded content on mount.
  const [revealed, setRevealed] = useState(false);
  const prevPathRef = useRef(path);
  const showDisclaimer = DISCLAIMER_ROUTES.includes(path);

  // On route change: reset to hidden until either loading clears or the
  // safety timeout fires.
  useEffect(() => {
    if (prevPathRef.current === path) return;
    prevPathRef.current = path;
    setRevealed(false);
  }, [path]);

  // Reveal when loading clears.
  useEffect(() => {
    if (revealed) return;
    if (!isLoading) {
      // Single rAF gives React time to commit any pending state from the
      // hooks that just resolved, so the first painted frame is complete.
      const frame = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [revealed, isLoading]);

  // Safety: never leave the screen hidden indefinitely. If a hook is genuinely
  // stuck loading, force-reveal after 400ms so the route's own skeleton UI shows.
  // Note: this timer depends on `path` so it resets on each navigation; 400ms
  // is short enough that even rapid multi-tab switching still recovers quickly.
  useEffect(() => {
    if (revealed) return;
    const t = setTimeout(() => setRevealed(true), 400);
    return () => clearTimeout(t);
  }, [revealed, path]);

  return (
    // mode="sync" lets old and new routes animate simultaneously instead of
    // waiting for the exit to complete before mounting the new route.
    // This prevents blank-screen gaps when the user switches tabs quickly.
    <AnimatePresence mode="sync" initial={false}>
      {/*
        Flex column with min-h-full pushes the footer to the bottom of the
        scroll area on short pages (e.g., Scan AVS) so the disclaimer always
        sits just above the BottomTabBar instead of floating mid-screen.
        pb-24 reserves space below for the fixed BottomTabBar on mobile
        (md:pb-12 because the tab bar is hidden on desktop).
      */}
      <motion.div
        key={path}
        className="flex min-h-full flex-col pb-24 md:pb-12"
        initial={{ opacity: 0 }}
        // Soft entry once the new content is ready to be seen
        animate={{ opacity: revealed ? 1 : 0, transition: { duration: 0.18, ease: "easeOut" } }}
        // Fast exit so the brief blank gap before the next route is minimised
        exit={{ opacity: 0, transition: { duration: 0.06, ease: "easeIn" } }}
      >
        <main className="flex-1">
          <AppErrorBoundary>
            <Outlet />
          </AppErrorBoundary>
        </main>
        {showDisclaimer && (
          <footer className="border-t border-border">
            <Disclaimer />
          </footer>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You're offline — changes are paused until connectivity is restored.</span>
    </div>
  );
}

function SyncErrorBanner() {
  const { hasError } = useRealtimeSyncHealth();
  if (!hasError) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>Live sync interrupted — data may be delayed. Refresh the page to reconnect.</span>
    </div>
  );
}


function RootComponent() {
  // Apply localStorage theme immediately on mount to avoid a flash
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  // Track the visual viewport so sheets shrink correctly when the mobile
  // soft keyboard opens (writes window-height in px to --vvh on <html>)
  useVisualViewport();

  const { user, isLoading: authLoading } = useAuth();
  const { careCircleId, role, isLoading: circleLoading } = useCareCircle(user?.id);

  // Once prefs load from Supabase, apply the saved theme — this is what
  // keeps the theme consistent across devices
  const { prefs, isLoaded: prefsLoaded } = usePreferences(user?.id);
  useEffect(() => {
    if (prefsLoaded && prefs.theme) applyTheme(prefs.theme);
  }, [prefsLoaded, prefs.theme]);
  useNewMemberAlert(careCircleId, role);
  const navigate    = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isPublicRoute   = PUBLIC_ROUTES.includes(currentPath);
  const isShellFree     = SHELL_FREE_ROUTES.includes(currentPath);
  const isLoading       = authLoading || (!isPublicRoute && !!user && circleLoading);

  useEffect(() => {
    if (isLoading) return;

    // Guard 1: Must be authenticated to see any non-public route
    if (!user && !isPublicRoute) {
      navigate({ to: "/login" });
      return;
    }

    // Guard 2: Must have a care circle to see any non-onboarding route
    if (user && !careCircleId && !isShellFree) {
      navigate({ to: "/onboarding" });
      return;
    }

    // Guard 3: Prevent already-setup users from seeing onboarding
    if (user && careCircleId && currentPath === "/onboarding") {
      navigate({ to: "/" });
    }
  }, [user, careCircleId, isLoading, isPublicRoute, isShellFree, currentPath, navigate]);

  // Show spinner while resolving auth + care circle state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  }

  // Shell-free routes: login, register, onboarding — no nav, no sidebar
  if (isShellFree) {
    return (
      <>
        <AppErrorBoundary>
          <Outlet />
        </AppErrorBoundary>
        <Toaster theme="dark" position="bottom-center" offset={16} />
      </>
    );
  }

  // Full authenticated app shell
  return (
    <>
      <div data-app-shell className="flex min-h-screen w-full overflow-x-hidden bg-background text-foreground md:h-screen md:overflow-hidden">
        <SideNav />
        {/* Right column: on desktop, constrained to screen height so only this pane scrolls */}
        <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
          <AppHeader />
          <OfflineBanner />
          <SyncErrorBanner />
          <div className="flex-1 overflow-y-auto">
            <DeferredRouteContent key={user?.id ?? "anon"} path={currentPath} />
          </div>
        </div>
        <BottomTabBar />
      </div>
      <Toaster
        theme="dark"
        position="bottom-center"
        offset={80}
        toastOptions={{
          classNames: {
            toast: "!bg-card !border-border !text-foreground !rounded-xl !shadow-lg",
          },
          actionButtonStyle: {
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            borderRadius: "6px",
            padding: "3px 10px",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer",
            border: "none",
          },
        }}
      />
    </>
  );
}
