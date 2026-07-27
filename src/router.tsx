import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { handleError, emitRetryScheduled } from "./lib/error-handler";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">پاڼه بار نشوه</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        بیا هڅه
      </button>
    </div>
  );
}

function DefaultNotFoundComponent() {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold text-foreground">ونه موندل شو</h2>
      <p className="text-sm text-muted-foreground">دا برخه شتون نلري.</p>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error: unknown) => {
          const status = (error as { status?: number })?.status;
          // Never retry on 4xx client errors — those won't fix themselves.
          if (status && status >= 400 && status < 500) return false;
          // Retry up to 3 times for network failures and 5xx errors.
          return failureCount < 3;
        },
        // Exponential backoff with jitter: ~500ms, 1s, 2s, 4s… capped at 15s.
        retryDelay: (attemptIndex) => {
          const base = Math.min(500 * 2 ** attemptIndex, 15_000);
          const jitter = Math.random() * 250;
          return base + jitter;
        },
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Silent on background refetches when data exists; toast otherwise.
        const silent = query.state.data !== undefined;
        const n = handleError(error, { context: "د معلوماتو راوړل", silent });
        // Predict whether React Query will schedule an automatic retry and broadcast
        // the countdown so the error-details dialog can surface it.
        const status = (error as { status?: number })?.status;
        const failureCount = query.state.fetchFailureCount;
        const willRetry = !(status && status >= 400 && status < 500) && failureCount < 3;
        if (willRetry) {
          const base = Math.min(500 * 2 ** failureCount, 15_000);
          emitRetryScheduled({
            incidentId: n.incidentId,
            delayMs: base + 250,
            attempt: failureCount + 1,
          });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        handleError(error, { context: "عملیه ناکامه شوه" });
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  return router;
};
