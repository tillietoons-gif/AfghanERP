import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ErrorBoundary } from "../components/error-boundary";
import { handleError } from "../lib/error-handler";
import { ErrorDetailsHost } from "../components/error-details-host";
import { NetworkBanner } from "../components/network-banner";
import { installFormPreservation } from "../lib/form-preservation";
import { installErrorCapture, reportError } from "../lib/error-reporting";
import { registerOfflineApp } from "../lib/offline-app";
import { ThemeProvider } from "../components/theme-provider";
import { ShortcutsOverlay } from "../components/shortcuts-overlay";
import { NavShortcuts } from "../components/nav-shortcuts";
import { TopProgressBar } from "../components/top-progress-bar";
import { OnboardingProvider } from "../components/onboarding/onboarding-wizard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">۴۰۴</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">پاڼه ونه موندل شوه</h2>
        <p className="mt-2 text-sm text-muted-foreground">هغه پاڼه چې تاسو یې لټوئ شتون نلري.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            کور ته لاړ شئ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void reportError({
      error,
      source: "react_boundary",
      severity: "fatal",
      context: { boundary: "tanstack_root_error_component" },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">پاڼه بار نشوه</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          یو تېروتنه رامنځته شوه. مهرباني وکړئ بیا هڅه وکړئ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            بیا هڅه
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            کور
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "د افغان سوپر سټور — د مدیریت سیستم" },
      { name: "description", content: "د افغانستان لپاره د پښتو ژبې POS او ERP سیستم" },
      { name: "author", content: "Afghan SuperStore ERP" },
      { property: "og:title", content: "د افغان سوپر سټور — د مدیریت سیستم" },
      { property: "og:description", content: "د افغانستان لپاره د پښتو ژبې POS او ERP سیستم" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "د افغان سوپر سټور — د مدیریت سیستم" },
      { name: "twitter:description", content: "د افغانستان لپاره د پښتو ژبې POS او ERP سیستم" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe5eb534-f505-4ef0-8046-1b3313f011ec/id-preview-abe88922--da332201-dfd3-40d2-a871-3b5e3c125d04.lovable.app-1784293432179.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fe5eb534-f505-4ef0-8046-1b3313f011ec/id-preview-abe88922--da332201-dfd3-40d2-a871-3b5e3c125d04.lovable.app-1784293432179.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&family=Vazirmatn:wght@400;500;600;700;800&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return <>{children}</>;
  }

  return (
    <html lang="ps-AF" dir="rtl">
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const isDesktopApp = "__TAURI_INTERNALS__" in window;
    if (!isDesktopApp) {
      installFormPreservation();
      registerOfflineApp();
    }
    installErrorCapture();
    const onError = (e: ErrorEvent) =>
      handleError(e.error ?? e.message, { context: "غیرمنتظره تېروتنه", silent: true });
    const onRejection = (e: PromiseRejectionEvent) =>
      handleError(e.reason, { context: "ناسمه ژمنه", silent: true });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TopProgressBar />
        <NetworkBanner />
        <ErrorBoundary>
          <OnboardingProvider>
            <Outlet />
          </OnboardingProvider>
        </ErrorBoundary>
        <ErrorDetailsHost />
        <ShortcutsOverlay />
        <NavShortcuts />
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
