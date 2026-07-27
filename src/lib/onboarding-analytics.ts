import { getLocalSession } from "./local-auth";
import { getLocalSqlite } from "./local-sqlite";

export type OnboardingEvent =
  | "step_view"
  | "step_next"
  | "step_prev"
  | "step_jump"
  | "finished"
  | "skipped"
  | "opened"
  | "language_changed";

interface EventPayload {
  stepIndex?: number;
  stepId?: string;
  from?: number;
  to?: number;
  lang?: string;
  [k: string]: unknown;
}

/**
 * Fire-and-forget analytics logger for onboarding events.
 * Writes to audit_logs (entity="onboarding") and console for local debugging.
 */
export function logOnboardingEvent(event: OnboardingEvent, payload: EventPayload = {}) {
  const metadata = { event, ts: new Date().toISOString(), ...payload };
  try {
    // eslint-disable-next-line no-console
    console.info("[onboarding]", event, payload);
  } catch {
    // ignore
  }
  // Fire-and-forget local audit entry.
  void (async () => {
    try {
      const database = await getLocalSqlite();
      await database.execute(
        "INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
        [
          crypto.randomUUID(),
          getLocalSession()?.user.id ?? null,
          `onboarding.${event}`,
          "onboarding",
          payload.stepId ?? null,
          JSON.stringify(metadata),
        ],
      );
    } catch {
      // ignore
    }
  })();
}
