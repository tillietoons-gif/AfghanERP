import { getLocalSqlite } from "./local-sqlite";

export type AppRole =
  "owner" | "admin" | "manager" | "cashier" | "inventory_officer" | "accountant";

export interface LocalUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}

export interface LocalSession {
  user: LocalUser;
  roles: AppRole[];
}

const SESSION_KEY = "local.auth.session.v1";
const SESSION_EVENT = "local-auth-change";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function saveSession(session: LocalSession | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getLocalSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as LocalSession;
    if (!session.user?.id || !session.user.email || !Array.isArray(session.roles)) return null;
    return session;
  } catch {
    return null;
  }
}

export function subscribeToLocalAuth(listener: () => void): () => void {
  window.addEventListener(SESSION_EVENT, listener);
  return () => window.removeEventListener(SESSION_EVENT, listener);
}

export async function registerLocalOperator(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}): Promise<LocalSession> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || !input.fullName.trim())
    throw new Error("missing_account_details");
  if (input.password.length < 6) throw new Error("password_too_short");

  const database = await getLocalSqlite();
  const existing = database.select<{ id: string }>(
    "SELECT id FROM local_operators WHERE email = ?",
    [email],
  );
  if (existing.length > 0) throw new Error("email_already_registered");

  const operatorCount =
    database.select<{ count: number }>("SELECT COUNT(*) AS count FROM local_operators")[0]?.count ??
    0;
  const user: LocalUser = {
    id: crypto.randomUUID(),
    email,
    full_name: input.fullName.trim(),
    phone: input.phone.trim() || null,
  };
  const salt = randomSalt();
  const hash = await passwordHash(input.password, salt);
  const role: AppRole = operatorCount === 0 ? "owner" : "cashier";

  await database.transaction((transaction) => {
    transaction.run(
      "INSERT INTO local_operators(id, email, full_name, phone, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
      [user.id, user.email, user.full_name, user.phone, salt, hash],
    );
    transaction.run("INSERT INTO local_operator_roles(operator_id, role) VALUES (?, ?)", [
      user.id,
      role,
    ]);
  });

  const session = { user, roles: [role] };
  saveSession(session);
  return session;
}

export async function signInLocally(emailInput: string, password: string): Promise<LocalSession> {
  const email = emailInput.trim().toLowerCase();
  const database = await getLocalSqlite();
  const row = database.select<{
    id: string;
    email: string;
    full_name: string;
    phone: string | null;
    password_salt: string;
    password_hash: string;
  }>(
    "SELECT id, email, full_name, phone, password_salt, password_hash FROM local_operators WHERE email = ?",
    [email],
  )[0];
  if (!row || (await passwordHash(password, row.password_salt)) !== row.password_hash) {
    throw new Error("invalid_login");
  }

  const roles = database
    .select<{ role: AppRole }>("SELECT role FROM local_operator_roles WHERE operator_id = ?", [
      row.id,
    ])
    .map((entry) => entry.role);
  const session: LocalSession = {
    user: { id: row.id, email: row.email, full_name: row.full_name, phone: row.phone },
    roles,
  };
  saveSession(session);
  return session;
}

export async function resetLocalOperatorPassword(
  operatorId: string,
  newPassword: string,
): Promise<void> {
  const session = getLocalSession();
  if (!session?.roles.some((role) => role === "owner" || role === "admin")) {
    throw new Error("password_reset_not_allowed");
  }
  if (newPassword.length < 6) throw new Error("password_too_short");

  const database = await getLocalSqlite();
  const operator = database.select<{ id: string }>("SELECT id FROM local_operators WHERE id = ?", [
    operatorId,
  ])[0];
  if (!operator) throw new Error("operator_not_found");
  const targetIsOwner = database.select<{ role: AppRole }>(
    "SELECT role FROM local_operator_roles WHERE operator_id = ? AND role = 'owner'",
    [operatorId],
  )[0];
  if (targetIsOwner && !session.roles.includes("owner")) {
    throw new Error("owner_password_reset_requires_owner");
  }

  const salt = randomSalt();
  const hash = await passwordHash(newPassword, salt);
  await database.transaction((transaction) => {
    transaction.run(
      "UPDATE local_operators SET password_salt = ?, password_hash = ? WHERE id = ?",
      [salt, hash, operatorId],
    );
    transaction.run(
      "INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        session.user.id,
        "password_reset",
        "operator",
        operatorId,
        JSON.stringify({ by: "owner_or_admin" }),
      ],
    );
  });
}

export function signOutLocally(): void {
  if (typeof window !== "undefined") saveSession(null);
}
