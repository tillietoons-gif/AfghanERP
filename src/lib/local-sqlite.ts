import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const DATABASE_NAME = "dummy-friend-local";
const STORE_NAME = "files";
const DATABASE_FILE_KEY = "erp.sqlite";

type SqlValue = string | number | Uint8Array | null;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS local_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS local_operators (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    full_name TEXT NOT NULL,
    phone TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS local_operator_roles (
    operator_id TEXT NOT NULL REFERENCES local_operators(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    PRIMARY KEY(operator_id, role)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS store_settings (
    id TEXT PRIMARY KEY,
    store_name TEXT NOT NULL DEFAULT '',
    address TEXT,
    phone TEXT,
    tax_number TEXT,
    currency TEXT NOT NULL DEFAULT 'AFN',
    receipt_footer TEXT,
    quick_sale_allow_discounts INTEGER NOT NULL DEFAULT 1,
    quick_sale_force_cash INTEGER NOT NULL DEFAULT 0,
    quick_sale_show_preview INTEGER NOT NULL DEFAULT 0,
    audit_retention_days INTEGER NOT NULL DEFAULT 180,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_purge_log (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    trigger_source TEXT NOT NULL,
    retention_days INTEGER NOT NULL,
    rows_deleted INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    balance REAL NOT NULL DEFAULT 0,
    is_walk_in INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customer_opening_balances (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    opening_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    barcode TEXT,
    sku TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    purchase_cost REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'piece',
    pack_size REAL NOT NULL DEFAULT 1,
    expiry_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(barcode),
    UNIQUE(sku)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    invoice_no TEXT NOT NULL UNIQUE,
    client_request_id TEXT UNIQUE,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    sale_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    is_quick_sale INTEGER NOT NULL DEFAULT 0,
    receipt_printed INTEGER NOT NULL DEFAULT 1,
    receipt_printed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_payments (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    reference TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    movement_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    reference_id TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS supplier_opening_balances (
    id TEXT PRIMARY KEY,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    opening_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    invoice_no TEXT NOT NULL UNIQUE,
    supplier_invoice_no TEXT,
    supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_payments (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    reference TEXT
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
    amount REAL NOT NULL DEFAULT 0,
    paid_by TEXT NOT NULL DEFAULT 'cash',
    description TEXT,
    expense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sale_returns (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    return_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    refunded REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sale_return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_returns (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    return_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    refunded REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_return_items (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_barcodes (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL UNIQUE,
    pack_size REAL NOT NULL DEFAULT 1,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS error_reports (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    message TEXT NOT NULL,
    stack TEXT,
    source TEXT NOT NULL,
    severity TEXT NOT NULL,
    route TEXT,
    url TEXT,
    user_agent TEXT,
    http_status INTEGER,
    context TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT,
    resolved_by TEXT
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    resolved_by TEXT
  );

  CREATE INDEX IF NOT EXISTS products_active_name_idx ON products(is_active, name);
  CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(sale_date DESC);
  CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS customer_opening_balances_customer_idx ON customer_opening_balances(customer_id, opening_date);
  CREATE INDEX IF NOT EXISTS supplier_opening_balances_supplier_idx ON supplier_opening_balances(supplier_id, opening_date);
  CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases(purchase_date DESC);
  CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(expense_date DESC);
  CREATE INDEX IF NOT EXISTS error_reports_fingerprint_idx ON error_reports(fingerprint);
  CREATE INDEX IF NOT EXISTS error_reports_resolved_idx ON error_reports(resolved);
  CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);

  INSERT OR IGNORE INTO local_meta(key, value) VALUES ('schema_version', '1');
`;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("IndexedDB request failed"));
  });
}

async function openStorage(): Promise<IDBDatabase> {
  const operation = indexedDB.open(DATABASE_NAME, 1);
  operation.onupgradeneeded = () => {
    if (!operation.result.objectStoreNames.contains(STORE_NAME)) {
      operation.result.createObjectStore(STORE_NAME);
    }
  };
  return request(operation);
}

async function readDatabaseFile(): Promise<Uint8Array | null> {
  const storage = await openStorage();
  try {
    const transaction = storage.transaction(STORE_NAME, "readonly");
    const value = await request(transaction.objectStore(STORE_NAME).get(DATABASE_FILE_KEY));
    return value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  } finally {
    storage.close();
  }
}

async function writeDatabaseFile(contents: Uint8Array): Promise<void> {
  const storage = await openStorage();
  try {
    const transaction = storage.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(contents.slice().buffer, DATABASE_FILE_KEY);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
    });
  } finally {
    storage.close();
  }
}

function prepareDatabase(database: Database): void {
  database.run(SCHEMA);
  try {
    database.run("ALTER TABLE product_barcodes ADD COLUMN label TEXT");
  } catch {
    // Existing local databases have already received this additive migration.
  }
  try {
    database.run(
      "ALTER TABLE store_settings ADD COLUMN audit_retention_days INTEGER NOT NULL DEFAULT 180",
    );
  } catch {
    // Existing local databases have already received this additive migration.
  }
  try {
    database.run("ALTER TABLE expenses ADD COLUMN paid_by TEXT NOT NULL DEFAULT 'cash'");
  } catch {
    // Existing local databases have already received this additive migration.
  }
  try {
    database.run("ALTER TABLE purchases ADD COLUMN supplier_invoice_no TEXT");
  } catch {
    // Existing local databases have already received this additive migration.
  }
}

/**
 * Browser SQLite database persisted as an exported database file in IndexedDB.
 * Keep route-level SQL behind this object so application data access stays in
 * small, verifiable slices.
 */
export class LocalSqlite {
  constructor(private readonly database: Database) {}

  async execute(sql: string, params: SqlValue[] = []): Promise<void> {
    this.database.run(sql, params);
    await writeDatabaseFile(this.database.export());
  }

  select<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.database.prepare(sql, params);
    try {
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  async transaction(work: (database: LocalSqlite) => void): Promise<void> {
    this.database.run("BEGIN IMMEDIATE");
    try {
      work(this);
      this.database.run("COMMIT");
      await writeDatabaseFile(this.database.export());
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.database.run(sql, params);
  }

  export(): Uint8Array {
    return this.database.export();
  }
}

let localDatabasePromise: Promise<LocalSqlite> | null = null;

export function getLocalSqlite(): Promise<LocalSqlite> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local SQLite is only available in a browser with IndexedDB."));
  }
  if (!localDatabasePromise) {
    localDatabasePromise = (async () => {
      const [SQL, contents] = await Promise.all([
        initSqlJs({ locateFile: () => wasmUrl }),
        readDatabaseFile(),
      ]);
      const database = contents ? new SQL.Database(contents) : new SQL.Database();
      prepareDatabase(database);
      const local = new LocalSqlite(database);
      await writeDatabaseFile(database.export());
      return local;
    })();
  }
  return localDatabasePromise;
}

export async function exportLocalDatabase(): Promise<Uint8Array> {
  const database = await getLocalSqlite();
  await database.execute(
    "INSERT INTO local_meta(key, value) VALUES ('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [new Date().toISOString()],
  );
  return database.export();
}

export interface LocalDatabaseHealth {
  databaseBytes: number;
  lastBackupAt: string | null;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export async function getLocalDatabaseHealth(): Promise<LocalDatabaseHealth> {
  const database = await getLocalSqlite();
  const lastBackupAt = database.select<{ value: string }>(
    "SELECT value FROM local_meta WHERE key = 'last_backup_at'",
  )[0]?.value;
  let storageUsageBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    storageUsageBytes = estimate?.usage ?? null;
    storageQuotaBytes = estimate?.quota ?? null;
  } catch {
    // Some browsers do not expose storage estimates.
  }
  return {
    databaseBytes: database.export().byteLength,
    lastBackupAt: lastBackupAt ?? null,
    storageUsageBytes,
    storageQuotaBytes,
  };
}

export async function restoreLocalDatabase(contents: Uint8Array): Promise<void> {
  if (contents.byteLength < 100) throw new Error("backup_file_is_empty");
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let restored: Database | null = null;
  try {
    restored = new SQL.Database(contents);
    const tables = restored.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('local_meta', 'local_operators', 'store_settings')",
    );
    if ((tables[0]?.values.length ?? 0) !== 3) throw new Error("invalid_backup_file");
    prepareDatabase(restored);
    await writeDatabaseFile(restored.export());
    localDatabasePromise = Promise.resolve(new LocalSqlite(restored));
  } catch (error) {
    restored?.close();
    throw error;
  }
}
