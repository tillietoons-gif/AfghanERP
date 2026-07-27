import type { CreateSaleArgs } from "./pos-sale";
import { getLocalSession } from "./local-auth";
import { getLocalSqlite } from "./local-sqlite";

export interface LocalProduct {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  sale_price: number;
  purchase_cost: number;
  stock: number;
  pack_size: number;
}

export interface LocalOperator {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
}

export interface LocalOperatorRole {
  id: string;
  user_id: string;
  role: string;
}

export async function listLocalOperators(): Promise<LocalOperator[]> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>("SELECT id, email, full_name, phone FROM local_operators ORDER BY full_name")
    .map((row) => ({
      id: String(row.id),
      email: String(row.email),
      full_name: String(row.full_name),
      phone: row.phone === null ? null : String(row.phone),
    }));
}

export async function listLocalOperatorRoles(): Promise<LocalOperatorRole[]> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      "SELECT operator_id, role FROM local_operator_roles ORDER BY operator_id, role",
    )
    .map((row) => {
      const userId = String(row.operator_id);
      const role = String(row.role);
      return { id: `${userId}:${role}`, user_id: userId, role };
    });
}

export async function grantLocalOperatorRole(userId: string, role: string): Promise<void> {
  const session = getLocalSession();
  if (role === "owner" && !session?.roles.includes("owner"))
    throw new Error("owner_role_requires_owner");
  const database = await getLocalSqlite();
  const operator = database.select<ScalarRow>("SELECT id FROM local_operators WHERE id = ?", [
    userId,
  ])[0];
  if (!operator) throw new Error("operator_not_found");
  await database.transaction((transaction) => {
    transaction.run("INSERT OR IGNORE INTO local_operator_roles(operator_id, role) VALUES (?, ?)", [
      userId,
      role,
    ]);
    transaction.run(
      "INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        session?.user.id ?? null,
        "role_granted",
        "operator",
        userId,
        JSON.stringify({ role }),
      ],
    );
  });
}

export async function revokeLocalOperatorRole(roleId: string): Promise<void> {
  const separator = roleId.lastIndexOf(":");
  const userId = roleId.slice(0, separator);
  const role = roleId.slice(separator + 1);
  if (!userId || !role || separator < 1) throw new Error("invalid_role");
  const database = await getLocalSqlite();
  if (role === "owner") {
    const ownerCount = number(
      database.select<ScalarRow>(
        "SELECT COUNT(*) AS count FROM local_operator_roles WHERE role = 'owner'",
      )[0]?.count,
    );
    if (ownerCount <= 1) throw new Error("cannot_revoke_last_owner");
  }
  const session = getLocalSession();
  await database.transaction((transaction) => {
    transaction.run("DELETE FROM local_operator_roles WHERE operator_id = ? AND role = ?", [
      userId,
      role,
    ]);
    transaction.run(
      "INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        session?.user.id ?? null,
        "role_revoked",
        "operator",
        userId,
        JSON.stringify({ role }),
      ],
    );
  });
}

type ScalarRow = Record<string, string | number | null>;
type SqlValue = string | number | Uint8Array | null;

function number(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function dayStart(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function listLocalProducts(search: string): Promise<LocalProduct[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT id, name, barcode, sku, sale_price, purchase_cost, stock, pack_size
         FROM products
         WHERE is_active = 1 AND (name LIKE ? COLLATE NOCASE OR barcode LIKE ? OR sku LIKE ?)
         ORDER BY name LIMIT 30`
      : `SELECT id, name, barcode, sku, sale_price, purchase_cost, stock, pack_size
         FROM products WHERE is_active = 1 ORDER BY name LIMIT 30`,
    term ? [`%${term}%`, `%${term}%`, `%${term}%`] : [],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    barcode: row.barcode === null ? null : String(row.barcode),
    sku: row.sku === null ? null : String(row.sku),
    sale_price: number(row.sale_price),
    purchase_cost: number(row.purchase_cost),
    stock: number(row.stock),
    pack_size: number(row.pack_size) || 1,
  }));
}

export async function findLocalProductByCode(code: string): Promise<LocalProduct | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT id, name, barcode, sku, sale_price, purchase_cost, stock, pack_size
     FROM products WHERE is_active = 1 AND (barcode = ? OR sku = ?) LIMIT 1`,
    [code, code],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    barcode: row.barcode === null ? null : String(row.barcode),
    sku: row.sku === null ? null : String(row.sku),
    sale_price: number(row.sale_price),
    purchase_cost: number(row.purchase_cost),
    stock: number(row.stock),
    pack_size: number(row.pack_size) || 1,
  };
}

export async function listLocalCustomers(): Promise<Array<{ id: string; name: string }>> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>("SELECT id, name FROM customers WHERE is_walk_in = 0 ORDER BY name")
    .map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function listLocalTopProducts(): Promise<LocalProduct[]> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT p.id, p.name, p.barcode, p.sku, p.sale_price, p.purchase_cost, p.stock, p.pack_size,
       COALESCE(SUM(si.quantity), 0) AS qty_sold
     FROM products p
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.sale_date >= ? AND s.status != 'refunded'
     WHERE p.is_active = 1
     GROUP BY p.id
     ORDER BY qty_sold DESC, p.stock DESC, p.name
     LIMIT 20`,
    [dayStart(30)],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    barcode: row.barcode === null ? null : String(row.barcode),
    sku: row.sku === null ? null : String(row.sku),
    sale_price: number(row.sale_price),
    purchase_cost: number(row.purchase_cost),
    stock: number(row.stock),
    pack_size: number(row.pack_size) || 1,
  }));
}

export async function createLocalSale(args: CreateSaleArgs): Promise<string> {
  if (args.p_items.length === 0) throw new Error("empty_cart");
  if (args.p_payments.length === 0) throw new Error("no_payment");
  if (args.p_payments.some((payment) => payment.method === "credit") && !args.p_customer_id) {
    throw new Error("credit_requires_customer");
  }

  const database = await getLocalSqlite();
  const existing = database.select<ScalarRow>("SELECT id FROM sales WHERE client_request_id = ?", [
    args.p_client_request_id,
  ])[0];
  if (existing) return String(existing.id);

  const saleId = crypto.randomUUID();
  const invoiceNo = `L-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(
    database.select<ScalarRow>("SELECT COUNT(*) AS count FROM sales")[0]?.count ?? 0,
  ).padStart(5, "0")}`;
  const session = getLocalSession();
  let subtotal = 0;
  const lines = args.p_items.map((item) => {
    const product = database.select<ScalarRow>(
      "SELECT id, name, stock, purchase_cost FROM products WHERE id = ? AND is_active = 1",
      [item.product_id],
    )[0];
    if (!product) throw new Error("product_not_found");
    const quantity = number(item.quantity);
    if (quantity <= 0) throw new Error("invalid_quantity");
    if (number(product.stock) < quantity) {
      throw new Error(
        `insufficient_stock:${String(product.name)}|${number(product.stock)}|${quantity}`,
      );
    }
    const lineSubtotal = quantity * number(item.price) - number(item.discount);
    subtotal += lineSubtotal;
    return {
      product,
      quantity,
      price: number(item.price),
      discount: number(item.discount),
      lineSubtotal,
    };
  });
  const total = subtotal - number(args.p_discount) + number(args.p_tax);
  const paid = args.p_payments.reduce((sum, payment) => sum + number(payment.amount), 0);

  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO sales(id, invoice_no, client_request_id, customer_id, subtotal, discount, tax, total, paid, notes, is_quick_sale, receipt_printed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        invoiceNo,
        args.p_client_request_id,
        args.p_customer_id,
        subtotal,
        number(args.p_discount),
        number(args.p_tax),
        total,
        paid,
        args.p_notes,
        args.p_is_quick_sale ? 1 : 0,
        args.p_is_quick_sale ? 0 : 1,
      ],
    );
    for (const line of lines) {
      transaction.run(
        `INSERT INTO sale_items(id, sale_id, product_id, product_name, quantity, price, cost, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          saleId,
          line.product.id as string,
          line.product.name as string,
          line.quantity,
          line.price,
          number(line.product.purchase_cost),
          line.discount,
          line.lineSubtotal,
        ],
      );
      transaction.run(
        "UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [line.quantity, line.product.id as string],
      );
      transaction.run(
        `INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason)
         VALUES (?, ?, 'sale', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          line.product.id as string,
          -line.quantity,
          saleId,
          `${args.p_is_quick_sale ? "Quick sale" : "Sale"} ${invoiceNo}`,
        ],
      );
    }
    for (const payment of args.p_payments) {
      transaction.run(
        "INSERT INTO sale_payments(id, sale_id, method, amount) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), saleId, payment.method, number(payment.amount)],
      );
      if (payment.method === "credit" && args.p_customer_id) {
        transaction.run(
          "UPDATE customers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [number(payment.amount), args.p_customer_id],
        );
      }
    }
  });
  return saleId;
}

export async function getLocalDashboard() {
  const database = await getLocalSqlite();
  const today = dayStart();
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const stats =
    database.select<ScalarRow>(
      `SELECT
       COALESCE(SUM(total), 0) AS today_sales,
       COALESCE((SELECT SUM(sp.amount)
         FROM sale_payments sp JOIN sales cash_sales ON cash_sales.id = sp.sale_id
         WHERE cash_sales.sale_date >= ? AND cash_sales.status != 'refunded' AND sp.method = 'cash'), 0) AS cash_on_hand
     FROM sales WHERE sale_date >= ? AND status != 'refunded'`,
      [today, today],
    )[0] ?? {};
  const profit = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(si.subtotal - si.cost * si.quantity), 0) AS value
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.status != 'refunded'`,
    [today],
  )[0];
  const inventory =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(stock * purchase_cost), 0) AS value,
       COALESCE(SUM(CASE WHEN stock <= min_stock THEN 1 ELSE 0 END), 0) AS low_stock_count,
       COALESCE(SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') THEN 1 ELSE 0 END), 0) AS expiring_count
     FROM products WHERE is_active = 1`,
    )[0] ?? {};
  const quick =
    database.select<ScalarRow>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total,
       COALESCE((SELECT SUM(sp.amount)
         FROM sale_payments sp JOIN sales cash_sales ON cash_sales.id = sp.sale_id
         WHERE cash_sales.sale_date >= ? AND cash_sales.is_quick_sale = 1 AND cash_sales.status != 'refunded' AND sp.method = 'cash'), 0) AS cash_total
     FROM sales WHERE sale_date >= ? AND is_quick_sale = 1 AND status != 'refunded'`,
      [today, today],
    )[0] ?? {};
  const quickItems = database.select<ScalarRow>(
    `SELECT si.product_name AS name, SUM(si.quantity) AS qty, SUM(si.subtotal) AS revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.is_quick_sale = 1 AND s.status != 'refunded'
     GROUP BY si.product_name ORDER BY qty DESC LIMIT 5`,
    [today],
  );
  const recentSales = database.select<ScalarRow>(
    "SELECT id, invoice_no, total, sale_date, status FROM sales ORDER BY sale_date DESC LIMIT 6",
  );
  const chartRows = database.select<ScalarRow>(
    `SELECT substr(sale_date, 1, 10) AS day, COALESCE(SUM(total), 0) AS total
     FROM sales WHERE sale_date >= ? AND status != 'refunded' GROUP BY day`,
    [dayStart(6)],
  );
  const chartMap = new Map(chartRows.map((row) => [String(row.day), number(row.total)]));
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const day = date.toISOString().slice(0, 10);
    return { day, total: chartMap.get(day) ?? 0 };
  });
  const monthSales =
    database.select<ScalarRow>(
      "SELECT COALESCE(SUM(total), 0) AS value FROM sales WHERE sale_date >= ? AND status != 'refunded'",
      [month],
    )[0] ?? {};
  const monthProfit =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(si.subtotal - si.cost * si.quantity), 0) AS value
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.status != 'refunded'`,
      [month],
    )[0] ?? {};
  const receivables = database.select<ScalarRow>(
    "SELECT COALESCE(SUM(balance), 0) AS value FROM customers",
  )[0];
  return {
    stats: {
      today_sales: number(stats.today_sales),
      today_profit: number(profit?.value),
      inventory_value: number(inventory.value),
      low_stock_count: number(inventory.low_stock_count),
      expiring_count: number(inventory.expiring_count),
      cash_on_hand: number(stats.cash_on_hand),
    },
    quickSummary: {
      count: number(quick.count),
      total: number(quick.total),
      cash_total: number(quick.cash_total),
      items_sold: quickItems.reduce((sum, item) => sum + number(item.qty), 0),
      top_items: quickItems.map((item) => ({
        name: String(item.name),
        qty: number(item.qty),
        revenue: number(item.revenue),
      })),
    },
    recentSales: recentSales.map((row) => ({
      id: String(row.id),
      invoice_no: String(row.invoice_no),
      total: number(row.total),
      sale_date: String(row.sale_date),
      status: String(row.status),
    })),
    chartData,
    monthPl: {
      net_sales: number(monthSales.value),
      net_profit: number(monthProfit.value),
      expenses: 0,
    },
    recTotals: number(receivables?.value),
    payTotals: 0,
  };
}

// ============================================================================
// Products
// ============================================================================

export interface LocalProductFull {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  category_id: string | null;
  purchase_cost: number;
  sale_price: number;
  stock: number;
  min_stock: number;
  unit: string;
  pack_size: number;
  expiry_date: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function listLocalProductsFull(
  search: string,
  limit = 50,
  offset = 0,
  categoryId?: string,
): Promise<LocalProductFull[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const categoryFilter = categoryId ? " AND category_id = ?" : "";
  const filters = term
    ? [`%${term}%`, `%${term}%`, `%${term}%`, ...(categoryId ? [categoryId] : [])]
    : categoryId
      ? [categoryId]
      : [];
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT id, name, barcode, sku, category_id, purchase_cost, sale_price, stock, min_stock, unit, pack_size, expiry_date, is_active, created_at, updated_at
         FROM products
         WHERE is_active = 1 AND (name LIKE ? COLLATE NOCASE OR barcode LIKE ? OR sku LIKE ?)${categoryFilter}
         ORDER BY name LIMIT ? OFFSET ?`
      : `SELECT id, name, barcode, sku, category_id, purchase_cost, sale_price, stock, min_stock, unit, pack_size, expiry_date, is_active, created_at, updated_at
         FROM products WHERE is_active = 1${categoryFilter} ORDER BY name LIMIT ? OFFSET ?`,
    [...filters, limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    barcode: row.barcode === null ? null : String(row.barcode),
    sku: row.sku === null ? null : String(row.sku),
    category_id: row.category_id === null ? null : String(row.category_id),
    purchase_cost: number(row.purchase_cost),
    sale_price: number(row.sale_price),
    stock: number(row.stock),
    min_stock: number(row.min_stock),
    unit: String(row.unit),
    pack_size: number(row.pack_size) || 1,
    expiry_date: row.expiry_date === null ? null : String(row.expiry_date),
    is_active: number(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function countLocalProducts(search: string, categoryId?: string): Promise<number> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const categoryFilter = categoryId ? " AND category_id = ?" : "";
  const params = term
    ? [`%${term}%`, `%${term}%`, `%${term}%`, ...(categoryId ? [categoryId] : [])]
    : categoryId
      ? [categoryId]
      : [];
  const row = database.select<ScalarRow>(
    term
      ? `SELECT COUNT(*) AS count FROM products
         WHERE is_active = 1 AND (name LIKE ? COLLATE NOCASE OR barcode LIKE ? OR sku LIKE ?)${categoryFilter}`
      : `SELECT COUNT(*) AS count FROM products WHERE is_active = 1${categoryFilter}`,
    params,
  )[0];
  return number(row?.count);
}

export async function getLocalProduct(id: string): Promise<LocalProductFull | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT id, name, barcode, sku, category_id, purchase_cost, sale_price, stock, min_stock, unit, pack_size, expiry_date, is_active, created_at, updated_at
     FROM products WHERE id = ?`,
    [id],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    barcode: row.barcode === null ? null : String(row.barcode),
    sku: row.sku === null ? null : String(row.sku),
    category_id: row.category_id === null ? null : String(row.category_id),
    purchase_cost: number(row.purchase_cost),
    sale_price: number(row.sale_price),
    stock: number(row.stock),
    min_stock: number(row.min_stock),
    unit: String(row.unit),
    pack_size: number(row.pack_size) || 1,
    expiry_date: row.expiry_date === null ? null : String(row.expiry_date),
    is_active: number(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createLocalProduct(input: {
  name: string;
  barcode?: string | null;
  sku?: string | null;
  category_id?: string | null;
  purchase_cost: number;
  sale_price: number;
  stock?: number;
  opening_quantity?: number;
  min_stock: number;
  unit: string;
  pack_size: number;
  expiry_date?: string | null;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  const openingQuantity = number(input.opening_quantity ?? input.stock);
  if (openingQuantity < 0) throw new Error("opening_quantity_must_not_be_negative");
  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO products(id, name, barcode, sku, category_id, purchase_cost, sale_price, stock, min_stock, unit, pack_size, expiry_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        input.name,
        input.barcode ?? null,
        input.sku ?? null,
        input.category_id ?? null,
        input.purchase_cost,
        input.sale_price,
        openingQuantity,
        input.min_stock,
        input.unit,
        input.pack_size,
        input.expiry_date ?? null,
      ],
    );
    if (openingQuantity > 0) {
      transaction.run(
        `INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason)
         VALUES (?, ?, 'opening_stock', ?, ?, ?)`,
        [crypto.randomUUID(), id, openingQuantity, id, "Opening quantity"],
      );
    }
  });
  return id;
}

export async function updateLocalProduct(
  id: string,
  input: Partial<{
    name: string;
    barcode: string | null;
    sku: string | null;
    category_id: string | null;
    purchase_cost: number;
    sale_price: number;
    stock: number;
    min_stock: number;
    unit: string;
    pack_size: number;
    expiry_date: string | null;
    is_active: number;
  }>,
): Promise<void> {
  const database = await getLocalSqlite();
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as SqlValue);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  await database.execute(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function deleteLocalProduct(id: string): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute(
    "UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [id],
  );
}

export async function deactivateLocalProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await getLocalSqlite();
  await database.transaction((transaction) => {
    for (const id of ids) {
      transaction.run(
        "UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id],
      );
    }
  });
}

export async function adjustLocalProductStock(
  productId: string,
  delta: number,
  reason?: string,
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) throw new Error("invalid_stock_adjustment");
  const database = await getLocalSqlite();
  await database.transaction((transaction) => {
    const product = transaction.select<ScalarRow>(
      "SELECT id, stock FROM products WHERE id = ? AND is_active = 1",
      [productId],
    )[0];
    if (!product) throw new Error("product_not_found");
    const stock = number(product.stock);
    if (stock + delta < 0) throw new Error("insufficient_stock");
    transaction.run("UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      stock + delta,
      productId,
    ]);
    transaction.run(
      `INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        productId,
        delta > 0 ? "adjustment_in" : "adjustment_out",
        delta,
        productId,
        reason?.trim() || `Stock adjustment ${delta > 0 ? "+" : ""}${delta}`,
      ],
    );
  });
}

export async function listLocalProductMovements(productId: string): Promise<
  Array<{
    id: string;
    created_at: string;
    quantity: number;
    reason: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, created_at, quantity, reason FROM stock_movements
       WHERE product_id = ? ORDER BY created_at DESC LIMIT 8`,
      [productId],
    )
    .map((row) => ({
      id: String(row.id),
      created_at: String(row.created_at),
      quantity: number(row.quantity),
      reason: row.reason === null ? null : String(row.reason),
    }));
}

export async function listLocalCategories(): Promise<Array<{ id: string; name: string }>> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>("SELECT id, name FROM categories ORDER BY name")
    .map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function createLocalCategory(name: string): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  await database.execute("INSERT INTO categories(id, name) VALUES (?, ?)", [id, name]);
  return id;
}

type LocalNamedList = "categories" | "brands" | "expense_categories";

export async function listLocalNamedList(
  table: LocalNamedList,
  search: string,
  limit = 20,
  offset = 0,
  sortKey = "name",
  sortAsc = true,
): Promise<Array<{ id: string; name: string }>> {
  const database = await getLocalSqlite();
  const order = sortKey === "name" ? "name" : "created_at";
  const rows = database.select<ScalarRow>(
    `SELECT id, name FROM ${table}
     WHERE name LIKE ? COLLATE NOCASE
     ORDER BY ${order} ${sortAsc ? "ASC" : "DESC"} LIMIT ? OFFSET ?`,
    [`%${search.trim()}%`, limit, offset],
  );
  return rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function countLocalNamedList(table: LocalNamedList, search: string): Promise<number> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT COUNT(*) AS count FROM ${table} WHERE name LIKE ? COLLATE NOCASE`,
    [`%${search.trim()}%`],
  )[0];
  return number(row?.count);
}

export async function saveLocalNamedList(
  table: LocalNamedList,
  input: { id?: string; name: string },
): Promise<void> {
  const database = await getLocalSqlite();
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (input.id) {
    await database.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, input.id]);
    return;
  }
  await database.execute(`INSERT INTO ${table}(id, name) VALUES (?, ?)`, [
    crypto.randomUUID(),
    name,
  ]);
}

export async function deleteLocalNamedList(table: LocalNamedList, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await getLocalSqlite();
  const placeholders = ids.map(() => "?").join(", ");
  await database.execute(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
}

// ============================================================================
// Customers
// ============================================================================

export interface LocalCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
  is_walk_in: number;
  created_at: string;
  updated_at: string;
}

export async function listLocalCustomersFull(
  search: string,
  limit = 50,
  offset = 0,
): Promise<LocalCustomer[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT id, name, phone, address, balance, is_walk_in, created_at, updated_at
         FROM customers
         WHERE (name LIKE ? COLLATE NOCASE OR phone LIKE ?)
         ORDER BY name LIMIT ? OFFSET ?`
      : `SELECT id, name, phone, address, balance, is_walk_in, created_at, updated_at
         FROM customers ORDER BY name LIMIT ? OFFSET ?`,
    term ? [`%${term}%`, `%${term}%`, limit, offset] : [limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    phone: row.phone === null ? null : String(row.phone),
    address: row.address === null ? null : String(row.address),
    balance: number(row.balance),
    is_walk_in: number(row.is_walk_in),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function getLocalCustomer(id: string): Promise<LocalCustomer | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT id, name, phone, address, balance, is_walk_in, created_at, updated_at FROM customers WHERE id = ?`,
    [id],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    phone: row.phone === null ? null : String(row.phone),
    address: row.address === null ? null : String(row.address),
    balance: number(row.balance),
    is_walk_in: number(row.is_walk_in),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createLocalCustomer(input: {
  name: string;
  phone?: string | null;
  address?: string | null;
  is_walk_in?: number;
  opening_balance?: number;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  const openingBalance = number(input.opening_balance);
  if (openingBalance < 0) throw new Error("opening_balance_must_not_be_negative");
  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO customers(id, name, phone, address, balance, is_walk_in)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        input.phone ?? null,
        input.address ?? null,
        openingBalance,
        input.is_walk_in ?? 0,
      ],
    );
    if (openingBalance > 0) {
      transaction.run(
        "INSERT INTO customer_opening_balances(id, customer_id, amount) VALUES (?, ?, ?)",
        [crypto.randomUUID(), id, openingBalance],
      );
    }
  });
  return id;
}

export async function updateLocalCustomer(
  id: string,
  input: Partial<{
    name: string;
    phone: string | null;
    address: string | null;
    balance: number;
  }>,
): Promise<void> {
  const database = await getLocalSqlite();
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as SqlValue);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  await database.execute(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function countLocalCustomers(search: string): Promise<number> {
  const database = await getLocalSqlite();
  const term = `%${search.trim()}%`;
  const row = database.select<ScalarRow>(
    "SELECT COUNT(*) AS count FROM customers WHERE name LIKE ? COLLATE NOCASE OR phone LIKE ?",
    [term, term],
  )[0];
  return number(row?.count);
}

export async function deleteLocalCustomers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await getLocalSqlite();
  await database.execute(
    `DELETE FROM customers WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
}

export async function getCustomerLedger(customerId: string): Promise<
  Array<{
    id: string;
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>
> {
  const database = await getLocalSqlite();
  const sales = database.select<ScalarRow>(
    `SELECT id, sale_date as date, total, invoice_no
     FROM sales WHERE customer_id = ? AND status != 'refunded'
     ORDER BY sale_date`,
    [customerId],
  );
  const payments = database.select<ScalarRow>(
    `SELECT sp.id, s.sale_date as date, sp.amount, sp.method, s.invoice_no
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE s.customer_id = ? AND s.status != 'refunded'
     ORDER BY s.sale_date`,
    [customerId],
  );
  const returns = database.select<ScalarRow>(
    `SELECT id, return_date as date, total, invoice_no
     FROM sale_returns WHERE sale_id IN (SELECT id FROM sales WHERE customer_id = ?)
     ORDER BY return_date`,
    [customerId],
  );
  const openingBalances = database.select<ScalarRow>(
    `SELECT id, opening_date AS date, amount FROM customer_opening_balances
     WHERE customer_id = ? ORDER BY opening_date`,
    [customerId],
  );

  const entries: Array<{
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];
  for (const opening of openingBalances) {
    entries.push({
      date: String(opening.date),
      type: "opening_balance",
      description: "Opening balance",
      debit: number(opening.amount),
      credit: 0,
    });
  }
  for (const s of sales) {
    entries.push({
      date: String(s.date),
      type: "sale",
      description: `Sale ${s.invoice_no}`,
      debit: number(s.total),
      credit: 0,
    });
  }
  for (const p of payments) {
    entries.push({
      date: String(p.date),
      type: "payment",
      description: `Payment ${p.method} for ${p.invoice_no}`,
      debit: 0,
      credit: number(p.amount),
    });
  }
  for (const r of returns) {
    entries.push({
      date: String(r.date),
      type: "return",
      description: `Return ${r.invoice_no}`,
      debit: 0,
      credit: number(r.total),
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let runningBalance = 0;
  return entries.map((e) => {
    runningBalance += e.debit - e.credit;
    return { ...e, id: crypto.randomUUID(), balance: runningBalance };
  });
}

export async function recordLocalCustomerPayment(input: {
  customer_id: string;
  amount: number;
  method: string;
  reference?: string | null;
}): Promise<void> {
  const database = await getLocalSqlite();
  const sale = database.select<ScalarRow>(
    `SELECT id, total, paid FROM sales
     WHERE customer_id = ? AND status != 'refunded' AND paid < total
     ORDER BY sale_date ASC LIMIT 1`,
    [input.customer_id],
  )[0];
  if (!sale || input.amount <= 0 || input.amount > number(sale.total) - number(sale.paid)) {
    throw new Error("invalid_customer_payment");
  }
  await database.transaction((transaction) => {
    transaction.run(
      "INSERT INTO sale_payments(id, sale_id, method, amount, reference) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), sale.id as string, input.method, input.amount, input.reference ?? null],
    );
    transaction.run("UPDATE sales SET paid = paid + ? WHERE id = ?", [
      input.amount,
      sale.id as string,
    ]);
    transaction.run(
      "UPDATE customers SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [input.amount, input.customer_id],
    );
  });
}

// ============================================================================
// Suppliers
// ============================================================================

export interface LocalSupplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
}

export async function listLocalSuppliers(
  search: string,
  limit = 50,
  offset = 0,
): Promise<LocalSupplier[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT id, name, phone, address, balance, created_at, updated_at
         FROM suppliers
         WHERE name LIKE ? COLLATE NOCASE OR phone LIKE ?
         ORDER BY name LIMIT ? OFFSET ?`
      : `SELECT id, name, phone, address, balance, created_at, updated_at
         FROM suppliers ORDER BY name LIMIT ? OFFSET ?`,
    term ? [`%${term}%`, `%${term}%`, limit, offset] : [limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    phone: row.phone === null ? null : String(row.phone),
    address: row.address === null ? null : String(row.address),
    balance: number(row.balance),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function getLocalSupplier(id: string): Promise<LocalSupplier | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT id, name, phone, address, balance, created_at, updated_at FROM suppliers WHERE id = ?`,
    [id],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    phone: row.phone === null ? null : String(row.phone),
    address: row.address === null ? null : String(row.address),
    balance: number(row.balance),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createLocalSupplier(input: {
  name: string;
  phone?: string | null;
  address?: string | null;
  opening_balance?: number;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  const openingBalance = number(input.opening_balance);
  if (openingBalance < 0) throw new Error("opening_balance_must_not_be_negative");
  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO suppliers(id, name, phone, address, balance)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.name, input.phone ?? null, input.address ?? null, openingBalance],
    );
    if (openingBalance > 0) {
      transaction.run(
        "INSERT INTO supplier_opening_balances(id, supplier_id, amount) VALUES (?, ?, ?)",
        [crypto.randomUUID(), id, openingBalance],
      );
    }
  });
  return id;
}

export async function updateLocalSupplier(
  id: string,
  input: Partial<{
    name: string;
    phone: string | null;
    address: string | null;
    balance: number;
  }>,
): Promise<void> {
  const database = await getLocalSqlite();
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as SqlValue);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);
  await database.execute(`UPDATE suppliers SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function countLocalSuppliers(search: string): Promise<number> {
  const database = await getLocalSqlite();
  const term = `%${search.trim()}%`;
  const row = database.select<ScalarRow>(
    "SELECT COUNT(*) AS count FROM suppliers WHERE name LIKE ? COLLATE NOCASE OR phone LIKE ?",
    [term, term],
  )[0];
  return number(row?.count);
}

export async function deleteLocalSuppliers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await getLocalSqlite();
  await database.execute(
    `DELETE FROM suppliers WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
}

export async function getSupplierLedger(supplierId: string): Promise<
  Array<{
    id: string;
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>
> {
  const database = await getLocalSqlite();
  const purchases = database.select<ScalarRow>(
    `SELECT id, purchase_date as date, total, invoice_no
     FROM purchases WHERE supplier_id = ? AND status != 'refunded'
     ORDER BY purchase_date`,
    [supplierId],
  );
  const payments = database.select<ScalarRow>(
    `SELECT pp.id, p.purchase_date as date, pp.amount, pp.method, p.invoice_no
     FROM purchase_payments pp JOIN purchases p ON p.id = pp.purchase_id
     WHERE p.supplier_id = ? AND p.status != 'refunded'
     ORDER BY p.purchase_date`,
    [supplierId],
  );
  const returns = database.select<ScalarRow>(
    `SELECT id, return_date as date, total, invoice_no
     FROM purchase_returns WHERE purchase_id IN (SELECT id FROM purchases WHERE supplier_id = ?)
     ORDER BY return_date`,
    [supplierId],
  );
  const openingBalances = database.select<ScalarRow>(
    `SELECT id, opening_date AS date, amount FROM supplier_opening_balances
     WHERE supplier_id = ? ORDER BY opening_date`,
    [supplierId],
  );

  const entries: Array<{
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];
  for (const opening of openingBalances) {
    entries.push({
      date: String(opening.date),
      type: "opening_balance",
      description: "Opening balance",
      debit: number(opening.amount),
      credit: 0,
    });
  }
  for (const p of purchases) {
    entries.push({
      date: String(p.date),
      type: "purchase",
      description: `Purchase ${p.invoice_no}`,
      debit: number(p.total),
      credit: 0,
    });
  }
  for (const p of payments) {
    entries.push({
      date: String(p.date),
      type: "payment",
      description: `Payment ${p.method} for ${p.invoice_no}`,
      debit: 0,
      credit: number(p.amount),
    });
  }
  for (const r of returns) {
    entries.push({
      date: String(r.date),
      type: "return",
      description: `Return ${r.invoice_no}`,
      debit: 0,
      credit: number(r.total),
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let runningBalance = 0;
  return entries.map((e) => {
    runningBalance += e.debit - e.credit;
    return { ...e, id: crypto.randomUUID(), balance: runningBalance };
  });
}

export async function recordLocalSupplierPayment(input: {
  supplier_id: string;
  amount: number;
  method: string;
  reference?: string | null;
}): Promise<void> {
  const database = await getLocalSqlite();
  const purchase = database.select<ScalarRow>(
    `SELECT id, total, paid FROM purchases
     WHERE supplier_id = ? AND status != 'returned' AND paid < total
     ORDER BY purchase_date ASC LIMIT 1`,
    [input.supplier_id],
  )[0];
  if (
    !purchase ||
    input.amount <= 0 ||
    input.amount > number(purchase.total) - number(purchase.paid)
  ) {
    throw new Error("invalid_supplier_payment");
  }
  await database.transaction((transaction) => {
    transaction.run(
      "INSERT INTO purchase_payments(id, purchase_id, method, amount, reference) VALUES (?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        purchase.id as string,
        input.method,
        input.amount,
        input.reference ?? null,
      ],
    );
    transaction.run("UPDATE purchases SET paid = paid + ? WHERE id = ?", [
      input.amount,
      purchase.id as string,
    ]);
    transaction.run(
      "UPDATE suppliers SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [input.amount, input.supplier_id],
    );
  });
}

// ============================================================================
// Purchases
// ============================================================================

export interface LocalPurchase {
  id: string;
  invoice_no: string;
  supplier_invoice_no: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function listLocalPurchases(
  search: string,
  limit = 50,
  offset = 0,
): Promise<LocalPurchase[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT p.id, p.invoice_no, p.supplier_invoice_no, p.supplier_id, p.purchase_date, p.subtotal, p.discount, p.tax, p.total, p.paid, p.status, p.notes, p.created_at, p.updated_at,
            s.name as supplier_name
         FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.invoice_no LIKE ? OR s.name LIKE ?
         ORDER BY p.purchase_date DESC LIMIT ? OFFSET ?`
      : `SELECT p.id, p.invoice_no, p.supplier_invoice_no, p.supplier_id, p.purchase_date, p.subtotal, p.discount, p.tax, p.total, p.paid, p.status, p.notes, p.created_at, p.updated_at,
            s.name as supplier_name
         FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
         ORDER BY p.purchase_date DESC LIMIT ? OFFSET ?`,
    term ? [`%${term}%`, `%${term}%`, limit, offset] : [limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    invoice_no: String(row.invoice_no),
    supplier_invoice_no: row.supplier_invoice_no === null ? null : String(row.supplier_invoice_no),
    supplier_id: row.supplier_id === null ? null : String(row.supplier_id),
    supplier_name: row.supplier_name === null ? null : String(row.supplier_name),
    purchase_date: String(row.purchase_date),
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    paid: number(row.paid),
    status: String(row.status),
    notes: row.notes === null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function getLocalPurchase(id: string): Promise<LocalPurchase | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT p.id, p.invoice_no, p.supplier_invoice_no, p.supplier_id, s.name AS supplier_name, p.purchase_date, p.subtotal, p.discount, p.tax, p.total, p.paid, p.status, p.notes, p.created_at, p.updated_at
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    [id],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    invoice_no: String(row.invoice_no),
    supplier_invoice_no: row.supplier_invoice_no === null ? null : String(row.supplier_invoice_no),
    supplier_id: row.supplier_id === null ? null : String(row.supplier_id),
    supplier_name: row.supplier_name === null ? null : String(row.supplier_name),
    purchase_date: String(row.purchase_date),
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    paid: number(row.paid),
    status: String(row.status),
    notes: row.notes === null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getLocalPurchaseItems(purchaseId: string): Promise<
  Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    cost: number;
    subtotal: number;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      "SELECT id, product_id, product_name, quantity, cost, subtotal FROM purchase_items WHERE purchase_id = ?",
      [purchaseId],
    )
    .map((row) => ({
      id: String(row.id),
      product_id: String(row.product_id),
      product_name: String(row.product_name),
      quantity: number(row.quantity),
      cost: number(row.cost),
      subtotal: number(row.subtotal),
    }));
}

export async function createLocalPurchaseReturn(input: {
  purchase_id: string;
  items: Array<{ product_id: string; quantity: number }>;
  notes?: string | null;
}): Promise<string> {
  const database = await getLocalSqlite();
  const purchase = database.select<ScalarRow>(
    "SELECT supplier_id, total FROM purchases WHERE id = ? AND status != 'returned'",
    [input.purchase_id],
  )[0];
  if (!purchase || input.items.length === 0) throw new Error("purchase_not_returnable");
  const returnId = crypto.randomUUID();
  const lines = input.items.map((item) => {
    const original = database.select<ScalarRow>(
      "SELECT product_name, quantity, price, cost, discount, subtotal FROM purchase_items WHERE purchase_id = ? AND product_id = ?",
      [input.purchase_id, item.product_id],
    )[0];
    const returned = database.select<ScalarRow>(
      `SELECT COALESCE(SUM(pri.quantity), 0) AS quantity FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.purchase_id = ? AND pri.product_id = ? AND pr.status = 'completed'`,
      [input.purchase_id, item.product_id],
    )[0];
    const quantity = number(item.quantity);
    if (
      !original ||
      quantity <= 0 ||
      quantity > number(original.quantity) - number(returned?.quantity)
    ) {
      throw new Error("invalid_return_quantity");
    }
    const unitPrice = number(original.price);
    const unitDiscount = number(original.discount) / number(original.quantity);
    return {
      product_id: item.product_id,
      product_name: String(original.product_name),
      quantity,
      price: unitPrice,
      cost: number(original.cost),
      discount: unitDiscount * quantity,
      subtotal: unitPrice * quantity - unitDiscount * quantity,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO purchase_returns(id, purchase_id, subtotal, total, refunded, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [returnId, input.purchase_id, total, total, total, input.notes ?? null],
    );
    for (const line of lines) {
      transaction.run(
        `INSERT INTO purchase_return_items(id, return_id, product_id, product_name, quantity, price, cost, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          returnId,
          line.product_id,
          line.product_name,
          line.quantity,
          line.price,
          line.cost,
          line.discount,
          line.subtotal,
        ],
      );
      transaction.run(
        "UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [line.quantity, line.product_id],
      );
      transaction.run(
        "INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason) VALUES (?, ?, 'purchase_return', ?, ?, ?)",
        [crypto.randomUUID(), line.product_id, -line.quantity, returnId, "Purchase return"],
      );
    }
    if (purchase.supplier_id) {
      transaction.run(
        "UPDATE suppliers SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [total, purchase.supplier_id],
      );
    }
    const returnedTotal = number(
      database.select<ScalarRow>(
        "SELECT COALESCE(SUM(total), 0) AS total FROM purchase_returns WHERE purchase_id = ? AND status = 'completed'",
        [input.purchase_id],
      )[0]?.total,
    );
    transaction.run("UPDATE purchases SET status = ? WHERE id = ?", [
      returnedTotal >= number(purchase.total) ? "returned" : "partial_return",
      input.purchase_id,
    ]);
  });
  return returnId;
}

export async function listLocalPurchasesForReturns(
  from: string,
  to: string,
  returned: boolean,
): Promise<
  Array<{
    id: string;
    invoice_no: string;
    purchase_date: string;
    status: string;
    total: number;
    paid: number;
    notes: string | null;
    supplier_name: string | null;
  }>
> {
  const database = await getLocalSqlite();
  const statuses = returned ? ["returned", "partial_return"] : ["completed"];
  return database
    .select<ScalarRow>(
      `SELECT p.id, p.invoice_no, p.purchase_date, p.status, p.total, p.paid, p.notes, s.name AS supplier_name
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE date(p.purchase_date) BETWEEN ? AND ? AND p.status IN (${statuses.map(() => "?").join(", ")})
       ORDER BY p.purchase_date DESC LIMIT 500`,
      [from, to, ...statuses],
    )
    .map((row) => ({
      id: String(row.id),
      invoice_no: String(row.invoice_no),
      purchase_date: String(row.purchase_date),
      status: String(row.status),
      total: number(row.total),
      paid: number(row.paid),
      notes: row.notes === null ? null : String(row.notes),
      supplier_name: row.supplier_name === null ? null : String(row.supplier_name),
    }));
}

export async function createLocalPurchase(input: {
  supplier_id: string | null;
  items: Array<{
    product_id: string;
    quantity: number;
    price: number;
    cost: number;
    discount: number;
  }>;
  payments: Array<{ method: string; amount: number }>;
  discount: number;
  tax: number;
  supplier_invoice_no?: string | null;
  notes?: string | null;
}): Promise<string> {
  const database = await getLocalSqlite();
  const purchaseId = crypto.randomUUID();
  const invoiceNo = `P-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(
    database.select<ScalarRow>("SELECT COUNT(*) AS count FROM purchases")[0]?.count ?? 0,
  ).padStart(5, "0")}`;

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const product = database.select<ScalarRow>(
      "SELECT id, name, purchase_cost FROM products WHERE id = ? AND is_active = 1",
      [item.product_id],
    )[0];
    if (!product) throw new Error("product_not_found");
    const quantity = number(item.quantity);
    if (quantity <= 0) throw new Error("invalid_quantity");
    const lineSubtotal = quantity * number(item.price) - number(item.discount);
    subtotal += lineSubtotal;
    return {
      product,
      quantity,
      price: number(item.price),
      cost: number(item.cost),
      discount: number(item.discount),
      lineSubtotal,
    };
  });
  const total = subtotal - number(input.discount) + number(input.tax);
  const paid = input.payments.reduce((sum, payment) => sum + number(payment.amount), 0);

  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO purchases(id, invoice_no, supplier_invoice_no, supplier_id, purchase_date, subtotal, discount, tax, total, paid, status, notes)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        purchaseId,
        invoiceNo,
        input.supplier_invoice_no ?? null,
        input.supplier_id,
        subtotal,
        number(input.discount),
        number(input.tax),
        total,
        paid,
        input.notes ?? null,
      ],
    );
    for (const line of lines) {
      transaction.run(
        `INSERT INTO purchase_items(id, purchase_id, product_id, product_name, quantity, price, cost, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          purchaseId,
          line.product.id as string,
          line.product.name as string,
          line.quantity,
          line.price,
          line.cost,
          line.discount,
          line.lineSubtotal,
        ],
      );
      transaction.run(
        "UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [line.quantity, line.product.id as string],
      );
      transaction.run(
        `INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason)
         VALUES (?, ?, 'purchase', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          line.product.id as string,
          line.quantity,
          purchaseId,
          `Purchase ${invoiceNo}`,
        ],
      );
    }
    for (const payment of input.payments) {
      transaction.run(
        "INSERT INTO purchase_payments(id, purchase_id, method, amount) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), purchaseId, payment.method, number(payment.amount)],
      );
    }
    if (input.supplier_id) {
      transaction.run(
        "UPDATE suppliers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [total, input.supplier_id],
      );
    }
  });
  return purchaseId;
}

// ============================================================================
// Expenses
// ============================================================================

export interface LocalExpense {
  id: string;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  paid_by: string;
  description: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export async function listLocalExpenses(
  search: string,
  limit = 50,
  offset = 0,
): Promise<LocalExpense[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT e.id, e.category_id, e.amount, e.paid_by, e.description, e.expense_date, e.created_at, e.updated_at,
            c.name as category_name
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE e.description LIKE ? COLLATE NOCASE
         ORDER BY e.expense_date DESC LIMIT ? OFFSET ?`
      : `SELECT e.id, e.category_id, e.amount, e.paid_by, e.description, e.expense_date, e.created_at, e.updated_at,
            c.name as category_name
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
         ORDER BY e.expense_date DESC LIMIT ? OFFSET ?`,
    term ? [`%${term}%`, limit, offset] : [limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    category_id: row.category_id === null ? null : String(row.category_id),
    category_name: row.category_name === null ? null : String(row.category_name),
    amount: number(row.amount),
    paid_by: String(row.paid_by),
    description: row.description === null ? null : String(row.description),
    expense_date: String(row.expense_date),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function listLocalExpenseCategories(): Promise<Array<{ id: string; name: string }>> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>("SELECT id, name FROM expense_categories ORDER BY name")
    .map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function createLocalExpense(input: {
  category_id: string | null;
  amount: number;
  paid_by?: string;
  description?: string | null;
  expense_date?: string;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  await database.execute(
    `INSERT INTO expenses(id, category_id, amount, paid_by, description, expense_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.category_id,
      input.amount,
      input.paid_by ?? "cash",
      input.description ?? null,
      input.expense_date ?? new Date().toISOString(),
    ],
  );
  return id;
}

// ============================================================================
// Stock Movements
// ============================================================================

export interface LocalStockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface LocalStockMovementWithProduct extends LocalStockMovement {
  products: { name: string; unit: string; stock: number } | null;
}

export interface LocalStockMovementFilters {
  productId?: string;
  movementType?: string;
  referenceId?: string;
  from?: string;
  to?: string;
}

function localStockMovementWhere(filters: LocalStockMovementFilters) {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (filters.productId) {
    clauses.push("stock_movements.product_id = ?");
    params.push(filters.productId);
  }
  if (filters.movementType) {
    clauses.push("stock_movements.movement_type = ?");
    params.push(filters.movementType);
  }
  if (filters.referenceId) {
    clauses.push("stock_movements.reference_id = ?");
    params.push(filters.referenceId);
  }
  if (filters.from) {
    clauses.push("stock_movements.created_at >= ?");
    params.push(new Date(filters.from).toISOString());
  }
  if (filters.to) {
    const end = new Date(filters.to);
    end.setDate(end.getDate() + 1);
    clauses.push("stock_movements.created_at < ?");
    params.push(end.toISOString());
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function mapLocalStockMovement(row: ScalarRow): LocalStockMovementWithProduct {
  const productName = row.product_name === null ? null : String(row.product_name);
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    movement_type: String(row.movement_type),
    quantity: number(row.quantity),
    reference_id: row.reference_id === null ? null : String(row.reference_id),
    reason: row.reason === null ? null : String(row.reason),
    created_at: String(row.created_at),
    products: productName
      ? {
          name: productName,
          unit: row.product_unit === null ? "" : String(row.product_unit),
          stock: number(row.product_stock),
        }
      : null,
  };
}

export async function listLocalStockMovementsFiltered(
  filters: LocalStockMovementFilters = {},
  limit = 100,
  offset = 0,
): Promise<LocalStockMovementWithProduct[]> {
  const database = await getLocalSqlite();
  const { where, params } = localStockMovementWhere(filters);
  const rows = database.select<ScalarRow>(
    `SELECT stock_movements.id, stock_movements.product_id, stock_movements.movement_type,
            stock_movements.quantity, stock_movements.reference_id, stock_movements.reason,
            stock_movements.created_at, products.name AS product_name, products.unit AS product_unit,
            products.stock AS product_stock
     FROM stock_movements
     LEFT JOIN products ON products.id = stock_movements.product_id
     ${where}
     ORDER BY stock_movements.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows.map(mapLocalStockMovement);
}

export async function countLocalStockMovements(
  filters: LocalStockMovementFilters = {},
): Promise<number> {
  const database = await getLocalSqlite();
  const { where, params } = localStockMovementWhere(filters);
  const row = database.select<ScalarRow>(
    `SELECT COUNT(*) AS count FROM stock_movements ${where}`,
    params,
  )[0];
  return number(row?.count);
}

export async function listLocalStockMovements(
  productId?: string,
  limit = 100,
  offset = 0,
): Promise<LocalStockMovement[]> {
  const database = await getLocalSqlite();
  let rows: ScalarRow[];
  if (productId) {
    rows = database.select<ScalarRow>(
      `SELECT id, product_id, movement_type, quantity, reference_id, reason, created_at
       FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [productId, limit, offset],
    );
  } else {
    rows = database.select<ScalarRow>(
      `SELECT id, product_id, movement_type, quantity, reference_id, reason, created_at
       FROM stock_movements ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }
  return rows.map((row) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    movement_type: String(row.movement_type),
    quantity: number(row.quantity),
    reference_id: row.reference_id === null ? null : String(row.reference_id),
    reason: row.reason === null ? null : String(row.reason),
    created_at: String(row.created_at),
  }));
}

// ============================================================================
// Sales & Returns
// ============================================================================

export interface LocalSale {
  id: string;
  invoice_no: string;
  client_request_id: string | null;
  customer_id: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  status: string;
  notes: string | null;
  is_quick_sale: number;
  receipt_printed: number;
  receipt_printed_at: string | null;
  customer_name: string | null;
}

export async function listLocalSales(
  search: string,
  limit = 50,
  offset = 0,
  includeQuickSales = true,
): Promise<LocalSale[]> {
  const database = await getLocalSqlite();
  const term = search.trim();
  const quickSaleFilter = includeQuickSales ? "" : " AND s.is_quick_sale = 0";
  const rows = database.select<ScalarRow>(
    term
      ? `SELECT s.id, s.invoice_no, s.client_request_id, s.customer_id, s.sale_date, s.subtotal, s.discount, s.tax, s.total, s.paid, s.status, s.notes, s.is_quick_sale, s.receipt_printed, s.receipt_printed_at,
            c.name as customer_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE (s.invoice_no LIKE ? OR c.name LIKE ?)${quickSaleFilter}
         ORDER BY s.sale_date DESC LIMIT ? OFFSET ?`
      : `SELECT s.id, s.invoice_no, s.client_request_id, s.customer_id, s.sale_date, s.subtotal, s.discount, s.tax, s.total, s.paid, s.status, s.notes, s.is_quick_sale, s.receipt_printed, s.receipt_printed_at,
            c.name as customer_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE 1 = 1${quickSaleFilter} ORDER BY s.sale_date DESC LIMIT ? OFFSET ?`,
    term ? [`%${term}%`, `%${term}%`, limit, offset] : [limit, offset],
  );
  return rows.map((row) => ({
    id: String(row.id),
    invoice_no: String(row.invoice_no),
    client_request_id: row.client_request_id === null ? null : String(row.client_request_id),
    customer_id: row.customer_id === null ? null : String(row.customer_id),
    sale_date: String(row.sale_date),
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    paid: number(row.paid),
    status: String(row.status),
    notes: row.notes === null ? null : String(row.notes),
    is_quick_sale: number(row.is_quick_sale),
    receipt_printed: number(row.receipt_printed),
    receipt_printed_at: row.receipt_printed_at === null ? null : String(row.receipt_printed_at),
    customer_name: row.customer_name === null ? null : String(row.customer_name),
  }));
}

export async function countLocalSales(includeQuickSales = true): Promise<number> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT COUNT(*) AS count FROM sales${includeQuickSales ? "" : " WHERE is_quick_sale = 0"}`,
  )[0];
  return number(row?.count);
}

export async function markLocalReceiptPrinted(saleId: string): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute(
    `UPDATE sales SET receipt_printed = 1, receipt_printed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [saleId],
  );
}

export async function getLocalSale(id: string): Promise<LocalSale | null> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>(
    `SELECT s.id, s.invoice_no, s.client_request_id, s.customer_id, s.sale_date, s.subtotal, s.discount, s.tax, s.total, s.paid, s.status, s.notes, s.is_quick_sale, s.receipt_printed, s.receipt_printed_at,
            c.name AS customer_name
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [id],
  )[0];
  if (!row) return null;
  return {
    id: String(row.id),
    invoice_no: String(row.invoice_no),
    client_request_id: row.client_request_id === null ? null : String(row.client_request_id),
    customer_id: row.customer_id === null ? null : String(row.customer_id),
    sale_date: String(row.sale_date),
    subtotal: number(row.subtotal),
    discount: number(row.discount),
    tax: number(row.tax),
    total: number(row.total),
    paid: number(row.paid),
    status: String(row.status),
    notes: row.notes === null ? null : String(row.notes),
    is_quick_sale: number(row.is_quick_sale),
    receipt_printed: number(row.receipt_printed),
    receipt_printed_at: row.receipt_printed_at === null ? null : String(row.receipt_printed_at),
    customer_name: row.customer_name === null ? null : String(row.customer_name),
  };
}

export async function getLocalSaleItems(saleId: string): Promise<
  Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    cost: number;
    discount: number;
    subtotal: number;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, product_id, product_name, quantity, price, cost, discount, subtotal
     FROM sale_items WHERE sale_id = ?`,
      [saleId],
    )
    .map((row) => ({
      id: String(row.id),
      product_id: String(row.product_id),
      product_name: String(row.product_name),
      quantity: number(row.quantity),
      price: number(row.price),
      cost: number(row.cost),
      discount: number(row.discount),
      subtotal: number(row.subtotal),
    }));
}

export async function createLocalSaleReturn(input: {
  sale_id: string;
  items: Array<{ product_id: string; quantity: number }>;
  notes?: string | null;
}): Promise<string> {
  const database = await getLocalSqlite();
  const sale = database.select<ScalarRow>(
    "SELECT customer_id, total FROM sales WHERE id = ? AND status != 'refunded'",
    [input.sale_id],
  )[0];
  if (!sale || input.items.length === 0) throw new Error("sale_not_returnable");
  const returnId = crypto.randomUUID();
  const lines = input.items.map((item) => {
    const original = database.select<ScalarRow>(
      "SELECT product_name, quantity, price, cost, discount FROM sale_items WHERE sale_id = ? AND product_id = ?",
      [input.sale_id, item.product_id],
    )[0];
    const returned = database.select<ScalarRow>(
      `SELECT COALESCE(SUM(sri.quantity), 0) AS quantity FROM sale_return_items sri
       JOIN sale_returns sr ON sr.id = sri.return_id WHERE sr.sale_id = ? AND sri.product_id = ? AND sr.status = 'completed'`,
      [input.sale_id, item.product_id],
    )[0];
    const quantity = number(item.quantity);
    if (
      !original ||
      quantity <= 0 ||
      quantity > number(original.quantity) - number(returned?.quantity)
    ) {
      throw new Error("invalid_return_quantity");
    }
    const unitPrice = number(original.price);
    const unitDiscount = number(original.discount) / number(original.quantity);
    return {
      product_id: item.product_id,
      product_name: String(original.product_name),
      quantity,
      price: unitPrice,
      cost: number(original.cost),
      discount: unitDiscount * quantity,
      subtotal: unitPrice * quantity - unitDiscount * quantity,
    };
  });
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  await database.transaction((transaction) => {
    transaction.run(
      `INSERT INTO sale_returns(id, sale_id, subtotal, total, refunded, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [returnId, input.sale_id, total, total, total, input.notes ?? null],
    );
    for (const line of lines) {
      transaction.run(
        `INSERT INTO sale_return_items(id, return_id, product_id, product_name, quantity, price, cost, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          returnId,
          line.product_id,
          line.product_name,
          line.quantity,
          line.price,
          line.cost,
          line.discount,
          line.subtotal,
        ],
      );
      transaction.run(
        "UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [line.quantity, line.product_id],
      );
      transaction.run(
        "INSERT INTO stock_movements(id, product_id, movement_type, quantity, reference_id, reason) VALUES (?, ?, 'sale_return', ?, ?, ?)",
        [crypto.randomUUID(), line.product_id, line.quantity, returnId, "Sale return"],
      );
    }
    if (sale.customer_id) {
      transaction.run(
        "UPDATE customers SET balance = MAX(0, balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [total, sale.customer_id],
      );
    }
    const returnedTotal = number(
      database.select<ScalarRow>(
        "SELECT COALESCE(SUM(total), 0) AS total FROM sale_returns WHERE sale_id = ? AND status = 'completed'",
        [input.sale_id],
      )[0]?.total,
    );
    transaction.run("UPDATE sales SET status = ? WHERE id = ?", [
      returnedTotal >= number(sale.total) ? "refunded" : "partial_refund",
      input.sale_id,
    ]);
  });
  return returnId;
}

export async function listLocalSalesForReturns(
  from: string,
  to: string,
): Promise<
  Array<{
    id: string;
    invoice_no: string;
    sale_date: string;
    status: string;
    total: number;
    notes: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, invoice_no, sale_date, status, total, notes FROM sales
       WHERE date(sale_date) BETWEEN ? AND ? AND status IN ('refunded', 'partial_refund')
       ORDER BY sale_date DESC LIMIT 500`,
      [from, to],
    )
    .map((row) => ({
      id: String(row.id),
      invoice_no: String(row.invoice_no),
      sale_date: String(row.sale_date),
      status: String(row.status),
      total: number(row.total),
      notes: row.notes === null ? null : String(row.notes),
    }));
}

export async function getLocalSalePayments(saleId: string): Promise<
  Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, method, amount, reference FROM sale_payments WHERE sale_id = ?`,
      [saleId],
    )
    .map((row) => ({
      id: String(row.id),
      method: String(row.method),
      amount: number(row.amount),
      reference: row.reference === null ? null : String(row.reference),
    }));
}

// ============================================================================
// Reports
// ============================================================================

export async function getLocalProfitLoss(
  from: string,
  to: string,
): Promise<{
  net_sales: number;
  net_profit: number;
  expenses: number;
}> {
  const database = await getLocalSqlite();
  const sales =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(total), 0) AS net_sales,
            COALESCE(SUM(si.subtotal - si.cost * si.quantity), 0) AS net_profit
     FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'`,
      [from, to],
    )[0] ?? {};
  const expenses =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE expense_date >= ? AND expense_date <= ?`,
      [from, to],
    )[0] ?? {};
  return {
    net_sales: number(sales.net_sales),
    net_profit: number(sales.net_profit),
    expenses: number(expenses.value),
  };
}

export async function getLocalProfitLossDetails(
  from: string,
  to: string,
): Promise<{
  from: string;
  to: string;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  cogs_fallback_used: boolean;
}> {
  const database = await getLocalSqlite();
  const sales =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(subtotal), 0) AS gross_sales, COALESCE(SUM(discount), 0) AS discounts
       FROM sales WHERE sale_date >= ? AND sale_date <= ? AND status != 'refunded'`,
      [from, to],
    )[0] ?? {};
  const costs = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(si.cost * si.quantity), 0) AS cogs
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'`,
    [from, to],
  )[0];
  const returns = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(total), 0) AS value FROM sale_returns
     WHERE return_date >= ? AND return_date <= ? AND status != 'refunded'`,
    [from, to],
  )[0];
  const expense = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE expense_date >= ? AND expense_date <= ?`,
    [from, to],
  )[0];
  const grossSales = number(sales.gross_sales);
  const discounts = number(sales.discounts);
  const returned = number(returns?.value);
  const cogs = number(costs?.cogs);
  const expenses = number(expense?.value);
  const netSales = grossSales - discounts - returned;
  const grossProfit = netSales - cogs;
  return {
    from,
    to,
    gross_sales: grossSales,
    discounts,
    returns: returned,
    net_sales: netSales,
    cogs,
    gross_profit: grossProfit,
    expenses,
    net_profit: grossProfit - expenses,
    cogs_fallback_used: false,
  };
}

export async function getLocalCashbook(
  from: string,
  to: string,
): Promise<
  Array<{
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>
> {
  const database = await getLocalSqlite();
  const sales = database.select<ScalarRow>(
    `SELECT sale_date as date, total, invoice_no FROM sales WHERE sale_date >= ? AND sale_date <= ? AND status != 'refunded'`,
    [from, to],
  );
  const purchases = database.select<ScalarRow>(
    `SELECT purchase_date as date, total, invoice_no FROM purchases WHERE purchase_date >= ? AND purchase_date <= ? AND status != 'refunded'`,
    [from, to],
  );
  const expenses = database.select<ScalarRow>(
    `SELECT expense_date as date, amount, description FROM expenses WHERE expense_date >= ? AND expense_date <= ?`,
    [from, to],
  );
  const salePayments = database.select<ScalarRow>(
    `SELECT s.sale_date as date, sp.amount, sp.method, s.invoice_no
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'`,
    [from, to],
  );
  const purchasePayments = database.select<ScalarRow>(
    `SELECT p.purchase_date as date, pp.amount, pp.method, p.invoice_no
     FROM purchase_payments pp JOIN purchases p ON p.id = pp.purchase_id
     WHERE p.purchase_date >= ? AND p.purchase_date <= ? AND p.status != 'refunded'`,
    [from, to],
  );

  const entries: Array<{
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
  }> = [];
  for (const s of sales)
    entries.push({
      date: String(s.date),
      type: "sale",
      description: `Sale ${s.invoice_no}`,
      debit: number(s.total),
      credit: 0,
    });
  for (const p of purchases)
    entries.push({
      date: String(p.date),
      type: "purchase",
      description: `Purchase ${p.invoice_no}`,
      debit: 0,
      credit: number(p.total),
    });
  for (const e of expenses)
    entries.push({
      date: String(e.date),
      type: "expense",
      description: String(e.description ?? "Expense"),
      debit: 0,
      credit: number(e.amount),
    });
  for (const p of salePayments)
    entries.push({
      date: String(p.date),
      type: "payment",
      description: `Payment ${p.method} for ${p.invoice_no}`,
      debit: number(p.amount),
      credit: 0,
    });
  for (const p of purchasePayments)
    entries.push({
      date: String(p.date),
      type: "payment",
      description: `Payment ${p.method} for ${p.invoice_no}`,
      debit: 0,
      credit: number(p.amount),
    });

  entries.sort((a, b) => a.date.localeCompare(b.date));
  let runningBalance = 0;
  return entries.map((e) => {
    runningBalance += e.debit - e.credit;
    return { ...e, id: crypto.randomUUID(), balance: runningBalance };
  });
}

export async function getLocalCashbookDetails(
  from: string,
  to: string,
): Promise<{
  opening: number;
  closing: number;
  total_in: number;
  total_out: number;
  rows: Array<{
    ts: string;
    txn_type: string;
    reference: string;
    description: string;
    cash_in: number;
    cash_out: number;
    running_balance: number;
  }>;
}> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT s.sale_date AS ts, 'cash_sale' AS txn_type, s.invoice_no AS reference,
            s.invoice_no AS description, sp.amount AS cash_in, 0 AS cash_out
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE sp.method = 'cash' AND s.status != 'refunded' AND date(s.sale_date) BETWEEN ? AND ?
     UNION ALL
     SELECT p.purchase_date, 'cash_purchase', p.invoice_no, p.invoice_no, 0, pp.amount
     FROM purchase_payments pp JOIN purchases p ON p.id = pp.purchase_id
     WHERE pp.method = 'cash' AND p.status != 'refunded' AND date(p.purchase_date) BETWEEN ? AND ?
     UNION ALL
     SELECT expense_date, 'cash_expense', id, COALESCE(description, 'Expense'), 0, amount
     FROM expenses WHERE date(expense_date) BETWEEN ? AND ?
     UNION ALL
     SELECT return_date, 'cash_refund', id, COALESCE(notes, 'Sale return'), 0, refunded
     FROM sale_returns WHERE status = 'completed' AND date(return_date) BETWEEN ? AND ?
     ORDER BY ts, txn_type`,
    [from, to, from, to, from, to, from, to],
  );
  const prior = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(cash_in - cash_out), 0) AS opening FROM (
       SELECT sp.amount AS cash_in, 0 AS cash_out FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE sp.method = 'cash' AND s.status != 'refunded' AND date(s.sale_date) < ?
       UNION ALL
       SELECT 0, pp.amount FROM purchase_payments pp JOIN purchases p ON p.id = pp.purchase_id
       WHERE pp.method = 'cash' AND p.status != 'refunded' AND date(p.purchase_date) < ?
       UNION ALL SELECT 0, amount FROM expenses WHERE date(expense_date) < ?
       UNION ALL SELECT 0, refunded FROM sale_returns WHERE status = 'completed' AND date(return_date) < ?
     )`,
    [from, from, from, from],
  )[0];
  const opening = number(prior?.opening);
  let runningBalance = opening;
  let totalIn = 0;
  let totalOut = 0;
  const ledgerRows = rows.map((row) => {
    const cashIn = number(row.cash_in);
    const cashOut = number(row.cash_out);
    totalIn += cashIn;
    totalOut += cashOut;
    runningBalance += cashIn - cashOut;
    return {
      ts: String(row.ts),
      txn_type: String(row.txn_type),
      reference: String(row.reference),
      description: String(row.description),
      cash_in: cashIn,
      cash_out: cashOut,
      running_balance: runningBalance,
    };
  });
  return {
    opening,
    closing: runningBalance,
    total_in: totalIn,
    total_out: totalOut,
    rows: ledgerRows,
  };
}

export async function getLocalAccountBalances(
  from: string,
  to: string,
): Promise<
  Array<{ account: string; opening: number; debit: number; credit: number; closing: number }>
> {
  const cashbook = await getLocalCashbookDetails(from, to);
  const receivables = await getLocalReceivables();
  const payables = await getLocalPayables();
  const inventory = await getLocalInventoryValuation();
  const profit = await getLocalProfitLossDetails(from, to);
  return [
    {
      account: "نغدې",
      opening: cashbook.opening,
      debit: cashbook.total_in,
      credit: cashbook.total_out,
      closing: cashbook.closing,
    },
    {
      account: "حسابونه ترلاسه کېدونکي",
      opening: 0,
      debit: 0,
      credit: 0,
      closing: receivables.reduce((sum, row) => sum + row.balance, 0),
    },
    { account: "موجودي", opening: 0, debit: 0, credit: 0, closing: inventory.total_value },
    {
      account: "حسابونه ورکول کېدونکي",
      opening: 0,
      debit: 0,
      credit: 0,
      closing: payables.reduce((sum, row) => sum + row.balance, 0),
    },
    { account: "د دورې ګټه", opening: 0, debit: 0, credit: 0, closing: profit.net_profit },
  ];
}

export async function getLocalBalanceSheet(asOf: string): Promise<{
  as_of: string;
  assets: {
    cash_on_hand: number;
    bank: number;
    receivables: number;
    inventory: number;
    total: number;
  };
  liabilities: { payables: number; customer_prepaid: number; total: number };
  equity: { opening_capital: number; retained_profit: number; total: number };
  balanced: boolean;
  note: string;
}> {
  const cashbook = await getLocalCashbookDetails("0001-01-01", asOf);
  const receivables = await getLocalReceivables();
  const payables = await getLocalPayables();
  const inventory = await getLocalInventoryValuation();
  const profit = await getLocalProfitLossDetails("0001-01-01", asOf);
  const receivableTotal = receivables.reduce((sum, row) => sum + row.balance, 0);
  const payableTotal = payables.reduce((sum, row) => sum + row.balance, 0);
  const assets = {
    cash_on_hand: cashbook.closing,
    bank: 0,
    receivables: receivableTotal,
    inventory: inventory.total_value,
    total: cashbook.closing + receivableTotal + inventory.total_value,
  };
  const liabilities = { payables: payableTotal, customer_prepaid: 0, total: payableTotal };
  const equity = {
    opening_capital: assets.total - liabilities.total - profit.net_profit,
    retained_profit: profit.net_profit,
    total: assets.total - liabilities.total,
  };
  return { as_of: asOf, assets, liabilities, equity, balanced: true, note: "" };
}

export async function getLocalInventoryValuation(): Promise<{
  total_value: number;
  items: Array<{
    product_id: string;
    name: string;
    category: string;
    unit: string;
    stock: number;
    cost: number;
    sale_price: number;
    cost_value: number;
    sale_value: number;
    potential_profit: number;
  }>;
}> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT p.id, p.name, p.stock, p.purchase_cost, p.sale_price, p.unit,
            COALESCE(c.name, '') AS category
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = 1 AND p.stock > 0`,
  );
  const items = rows.map((row) => ({
    product_id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    unit: String(row.unit),
    stock: number(row.stock),
    cost: number(row.purchase_cost),
    sale_price: number(row.sale_price),
    cost_value: number(row.stock) * number(row.purchase_cost),
    sale_value: number(row.stock) * number(row.sale_price),
    potential_profit: number(row.stock) * (number(row.sale_price) - number(row.purchase_cost)),
  }));
  return {
    total_value: items.reduce((sum, item) => sum + item.cost_value, 0),
    items,
  };
}

export async function getLocalLowStock(): Promise<
  Array<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    min_stock: number;
    unit: string;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, name, sku, stock, min_stock, unit
       FROM products WHERE is_active = 1 AND stock <= min_stock ORDER BY stock`,
    )
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sku: row.sku === null ? null : String(row.sku),
      stock: number(row.stock),
      min_stock: number(row.min_stock),
      unit: String(row.unit),
    }));
}

export async function getLocalExpiring(days = 30): Promise<
  Array<{
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    expiry_date: string;
    unit: string;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, name, sku, stock, expiry_date, unit
       FROM products WHERE is_active = 1 AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+' || ? || ' days') ORDER BY expiry_date`,
      [days],
    )
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sku: row.sku === null ? null : String(row.sku),
      stock: number(row.stock),
      expiry_date: String(row.expiry_date),
      unit: String(row.unit),
    }));
}

export async function getLocalReceivables(): Promise<
  Array<{ customer_id: string; name: string; balance: number }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id as customer_id, name, balance FROM customers WHERE balance > 0 AND is_walk_in = 0 ORDER BY balance DESC`,
    )
    .map((row) => ({
      customer_id: String(row.customer_id),
      name: String(row.name),
      balance: number(row.balance),
    }));
}

export async function getLocalReceivablesDetails(): Promise<
  Array<{
    customer_id: string;
    name: string;
    phone: string | null;
    credit_sales: number;
    paid: number;
    balance: number;
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
    last_payment: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT c.id AS customer_id, c.name, c.phone, c.balance,
              COALESCE(SUM(s.total), 0) AS credit_sales, COALESCE(SUM(s.paid), 0) AS paid
       FROM customers c LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'refunded'
       WHERE c.is_walk_in = 0 AND c.balance > 0
       GROUP BY c.id ORDER BY c.balance DESC`,
    )
    .map((row) => {
      const balance = number(row.balance);
      return {
        customer_id: String(row.customer_id),
        name: String(row.name),
        phone: row.phone === null ? null : String(row.phone),
        credit_sales: number(row.credit_sales),
        paid: number(row.paid),
        balance,
        aging_0_30: balance,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_90_plus: 0,
        last_payment: null,
      };
    });
}

export async function getLocalPayables(): Promise<
  Array<{ supplier_id: string; name: string; balance: number }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id as supplier_id, name, balance FROM suppliers WHERE balance > 0 ORDER BY balance DESC`,
    )
    .map((row) => ({
      supplier_id: String(row.supplier_id),
      name: String(row.name),
      balance: number(row.balance),
    }));
}

export async function getLocalPayablesDetails(): Promise<
  Array<{
    supplier_id: string;
    name: string;
    phone: string | null;
    total_purchases: number;
    paid: number;
    balance: number;
    aging_0_30: number;
    aging_31_60: number;
    aging_61_90: number;
    aging_90_plus: number;
    last_payment: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT s.id AS supplier_id, s.name, s.phone, s.balance,
              COALESCE(SUM(p.total), 0) AS total_purchases, COALESCE(SUM(p.paid), 0) AS paid
       FROM suppliers s LEFT JOIN purchases p ON p.supplier_id = s.id AND p.status != 'refunded'
       WHERE s.balance > 0 GROUP BY s.id ORDER BY s.balance DESC`,
    )
    .map((row) => {
      const balance = number(row.balance);
      return {
        supplier_id: String(row.supplier_id),
        name: String(row.name),
        phone: row.phone === null ? null : String(row.phone),
        total_purchases: number(row.total_purchases),
        paid: number(row.paid),
        balance,
        aging_0_30: balance,
        aging_31_60: 0,
        aging_61_90: 0,
        aging_90_plus: 0,
        last_payment: null,
      };
    });
}

export async function getLocalSalesReport(
  from: string,
  to: string,
): Promise<
  Array<{
    date: string;
    count: number;
    total: number;
    cash: number;
    card: number;
    credit: number;
  }>
> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT substr(sale_date, 1, 10) as date,
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total,
            COALESCE(SUM(CASE WHEN sp.method = 'cash' THEN sp.amount ELSE 0 END), 0) as cash,
            COALESCE(SUM(CASE WHEN sp.method = 'card' THEN sp.amount ELSE 0 END), 0) as card,
            COALESCE(SUM(CASE WHEN sp.method = 'credit' THEN sp.amount ELSE 0 END), 0) as credit
     FROM sales s LEFT JOIN sale_payments sp ON sp.sale_id = s.id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'
     GROUP BY date ORDER BY date`,
    [from, to],
  );
  return rows.map((row) => ({
    date: String(row.date),
    count: number(row.count),
    total: number(row.total),
    cash: number(row.cash),
    card: number(row.card),
    credit: number(row.credit),
  }));
}

export async function getLocalSalesReportDetails(
  from: string,
  to: string,
  group: "day" | "cashier" | "product" | "category",
): Promise<{
  total_sales: number;
  total_profit: number;
  txn_count: number;
  items_sold: number;
  rows: Array<{
    bucket: string;
    qty: number;
    net_sales: number;
    profit: number;
    txn_count: number;
  }>;
}> {
  const database = await getLocalSqlite();
  const groupBy = {
    day: "substr(s.sale_date, 1, 10)",
    cashier: "'محلي'",
    product: "si.product_name",
    category: "COALESCE(c.name, 'بې کټګورۍ')",
  }[group];
  const rows = database.select<ScalarRow>(
    `SELECT ${groupBy} AS bucket, COALESCE(SUM(si.quantity), 0) AS qty,
            COALESCE(SUM(si.subtotal), 0) AS net_sales,
            COALESCE(SUM(si.subtotal - (si.cost * si.quantity)), 0) AS profit,
            COUNT(DISTINCT s.id) AS txn_count
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'
     GROUP BY ${groupBy} ORDER BY net_sales DESC`,
    [from, to],
  );
  const totals =
    database.select<ScalarRow>(
      `SELECT COUNT(*) AS txn_count, COALESCE(SUM(total), 0) AS total_sales
     FROM sales WHERE sale_date >= ? AND sale_date <= ? AND status != 'refunded'`,
      [from, to],
    )[0] ?? {};
  const itemTotals =
    database.select<ScalarRow>(
      `SELECT COALESCE(SUM(si.quantity), 0) AS items_sold,
            COALESCE(SUM(si.subtotal - (si.cost * si.quantity)), 0) AS total_profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.status != 'refunded'`,
      [from, to],
    )[0] ?? {};
  return {
    total_sales: number(totals.total_sales),
    total_profit: number(itemTotals.total_profit),
    txn_count: number(totals.txn_count),
    items_sold: number(itemTotals.items_sold),
    rows: rows.map((row) => ({
      bucket: String(row.bucket),
      qty: number(row.qty),
      net_sales: number(row.net_sales),
      profit: number(row.profit),
      txn_count: number(row.txn_count),
    })),
  };
}

export async function getLocalPurchaseReport(
  from: string,
  to: string,
): Promise<
  Array<{
    date: string;
    count: number;
    total: number;
  }>
> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT substr(purchase_date, 1, 10) as date,
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as total
     FROM purchases WHERE purchase_date >= ? AND purchase_date <= ? AND status != 'refunded'
     GROUP BY date ORDER BY date`,
    [from, to],
  );
  return rows.map((row) => ({
    date: String(row.date),
    count: number(row.count),
    total: number(row.total),
  }));
}

export async function getLocalPurchaseReportDetails(
  from: string,
  to: string,
  group: "day" | "supplier" | "product" | "category",
): Promise<{
  total_purchases: number;
  txn_count: number;
  items_purchased: number;
  rows: Array<{ bucket: string; qty: number; total: number; txn_count: number }>;
}> {
  const database = await getLocalSqlite();
  const groupBy = {
    day: "substr(p.purchase_date, 1, 10)",
    supplier: "COALESCE(s.name, 'بې عرضه کوونکی')",
    product: "pi.product_name",
    category: "COALESCE(c.name, 'بې کټګورۍ')",
  }[group];
  const rows = database.select<ScalarRow>(
    `SELECT ${groupBy} AS bucket, COALESCE(SUM(pi.quantity), 0) AS qty,
            COALESCE(SUM(pi.subtotal), 0) AS total, COUNT(DISTINCT p.id) AS txn_count
     FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN products product ON product.id = pi.product_id
     LEFT JOIN categories c ON c.id = product.category_id
     WHERE p.purchase_date >= ? AND p.purchase_date <= ? AND p.status != 'refunded'
     GROUP BY ${groupBy} ORDER BY total DESC`,
    [from, to],
  );
  const totals =
    database.select<ScalarRow>(
      `SELECT COUNT(*) AS txn_count, COALESCE(SUM(total), 0) AS total_purchases
     FROM purchases WHERE purchase_date >= ? AND purchase_date <= ? AND status != 'refunded'`,
      [from, to],
    )[0] ?? {};
  const quantity = database.select<ScalarRow>(
    `SELECT COALESCE(SUM(pi.quantity), 0) AS items_purchased
     FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.purchase_date >= ? AND p.purchase_date <= ? AND p.status != 'refunded'`,
    [from, to],
  )[0];
  return {
    total_purchases: number(totals.total_purchases),
    txn_count: number(totals.txn_count),
    items_purchased: number(quantity?.items_purchased),
    rows: rows.map((row) => ({
      bucket: String(row.bucket),
      qty: number(row.qty),
      total: number(row.total),
      txn_count: number(row.txn_count),
    })),
  };
}

export async function getLocalExpenseReport(
  from: string,
  to: string,
): Promise<
  Array<{
    category: string;
    count: number;
    total: number;
  }>
> {
  const database = await getLocalSqlite();
  const rows = database.select<ScalarRow>(
    `SELECT COALESCE(c.name, 'بې کټګورۍ') as category, COUNT(*) as count, COALESCE(SUM(e.amount), 0) as total
     FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
     WHERE e.expense_date >= ? AND e.expense_date <= ?
     GROUP BY c.name ORDER BY total DESC`,
    [from, to],
  );
  return rows.map((row) => ({
    category: String(row.category),
    count: number(row.count),
    total: number(row.total),
  }));
}

// ============================================================================
// Settings
// ============================================================================

export interface LocalStoreSettings {
  id: string;
  store_name: string;
  address: string | null;
  phone: string | null;
  tax_number: string | null;
  currency: string;
  receipt_footer: string | null;
  quick_sale_allow_discounts: number;
  quick_sale_force_cash: number;
  quick_sale_show_preview: number;
  audit_retention_days: number;
  updated_at: string;
}

export async function getLocalStoreSettings(): Promise<LocalStoreSettings> {
  const database = await getLocalSqlite();
  const row = database.select<ScalarRow>("SELECT * FROM store_settings LIMIT 1")[0];
  if (!row) {
    // Create default
    const id = "default";
    await database.execute(
      `INSERT INTO store_settings(id, store_name, currency) VALUES (?, 'Afghan SuperStore', 'AFN')`,
      [id],
    );
    return {
      id,
      store_name: "Afghan SuperStore",
      address: null,
      phone: null,
      tax_number: null,
      currency: "AFN",
      receipt_footer: null,
      quick_sale_allow_discounts: 1,
      quick_sale_force_cash: 0,
      quick_sale_show_preview: 0,
      audit_retention_days: 180,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    id: String(row.id),
    store_name: String(row.store_name),
    address: row.address === null ? null : String(row.address),
    phone: row.phone === null ? null : String(row.phone),
    tax_number: row.tax_number === null ? null : String(row.tax_number),
    currency: String(row.currency),
    receipt_footer: row.receipt_footer === null ? null : String(row.receipt_footer),
    quick_sale_allow_discounts: number(row.quick_sale_allow_discounts),
    quick_sale_force_cash: number(row.quick_sale_force_cash),
    quick_sale_show_preview: number(row.quick_sale_show_preview),
    audit_retention_days: number(row.audit_retention_days) || 180,
    updated_at: String(row.updated_at),
  };
}

export async function updateLocalStoreSettings(
  input: Partial<{
    store_name: string;
    address: string | null;
    phone: string | null;
    tax_number: string | null;
    currency: string;
    receipt_footer: string | null;
    quick_sale_allow_discounts: number;
    quick_sale_force_cash: number;
    quick_sale_show_preview: number;
    audit_retention_days: number;
  }>,
): Promise<void> {
  const database = await getLocalSqlite();
  const fields: string[] = [];
  const values: SqlValue[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as SqlValue);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push("default");
  await database.execute(`UPDATE store_settings SET ${fields.join(", ")} WHERE id = ?`, values);
}

export async function previewLocalAuditPurge(days: number): Promise<{
  to_purge: number;
  total: number;
  oldest: string | null;
}> {
  const database = await getLocalSqlite();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const row =
    database.select<ScalarRow>(
      `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END), 0) AS to_purge,
            MIN(created_at) AS oldest
     FROM audit_logs`,
      [cutoff.toISOString()],
    )[0] ?? {};
  return {
    total: number(row.total),
    to_purge: number(row.to_purge),
    oldest: row.oldest === null || row.oldest === undefined ? null : String(row.oldest),
  };
}

export async function listLocalAuditPurgeLog(): Promise<
  Array<{
    id: string;
    created_at: string;
    trigger_source: string;
    retention_days: number;
    rows_deleted: number;
    duration_ms: number;
    status: string;
    error_message: string | null;
  }>
> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT id, created_at, trigger_source, retention_days, rows_deleted, duration_ms, status, error_message
       FROM audit_purge_log ORDER BY created_at DESC LIMIT 20`,
    )
    .map((row) => ({
      id: String(row.id),
      created_at: String(row.created_at),
      trigger_source: String(row.trigger_source),
      retention_days: number(row.retention_days),
      rows_deleted: number(row.rows_deleted),
      duration_ms: number(row.duration_ms),
      status: String(row.status),
      error_message: row.error_message === null ? null : String(row.error_message),
    }));
}

export async function runLocalAuditPurge(days: number): Promise<number> {
  const database = await getLocalSqlite();
  const startedAt = performance.now();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const toDelete = database.select<ScalarRow>(
    "SELECT COUNT(*) AS count FROM audit_logs WHERE created_at < ?",
    [cutoff.toISOString()],
  )[0];
  const rowsDeleted = number(toDelete?.count);
  await database.transaction((transaction) => {
    transaction.run("DELETE FROM audit_logs WHERE created_at < ?", [cutoff.toISOString()]);
    transaction.run(
      `INSERT INTO audit_purge_log(id, trigger_source, retention_days, rows_deleted, duration_ms, status)
       VALUES (?, 'manual', ?, ?, ?, 'success')`,
      [crypto.randomUUID(), days, rowsDeleted, Math.round(performance.now() - startedAt)],
    );
  });
  return rowsDeleted;
}

// ============================================================================
// Audit Logs
// ============================================================================

export interface LocalAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: string;
  created_at: string;
}

export async function listLocalAuditLogs(filters: {
  entity?: string;
  action?: string;
  user_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<LocalAuditLog[]> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filters.entity) {
    conditions.push("entity = ?");
    params.push(filters.entity);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.user_id) {
    conditions.push("user_id = ?");
    params.push(filters.user_id);
  }
  if (filters.from) {
    conditions.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("created_at <= ?");
    params.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit ?? 50, filters.offset ?? 0);
  const rows = database.select<ScalarRow>(
    `SELECT id, user_id, action, entity, entity_id, metadata, created_at FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id),
    user_id: row.user_id === null ? null : String(row.user_id),
    action: String(row.action),
    entity: String(row.entity),
    entity_id: row.entity_id === null ? null : String(row.entity_id),
    metadata: String(row.metadata),
    created_at: String(row.created_at),
  }));
}

export async function countLocalAuditLogs(filters: {
  entity?: string;
  action?: string;
  user_id?: string;
  from?: string;
  to?: string;
}): Promise<number> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filters.entity) {
    conditions.push("entity = ?");
    params.push(filters.entity);
  }
  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }
  if (filters.user_id) {
    conditions.push("user_id = ?");
    params.push(filters.user_id);
  }
  if (filters.from) {
    conditions.push("created_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push("created_at <= ?");
    params.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = database.select<ScalarRow>(
    `SELECT COUNT(*) AS count FROM audit_logs ${where}`,
    params,
  )[0];
  return number(row?.count);
}

export async function listLocalAuditActors(): Promise<Array<{ id: string; full_name: string }>> {
  const database = await getLocalSqlite();
  return database
    .select<ScalarRow>(
      `SELECT DISTINCT local_operators.id, local_operators.full_name
       FROM local_operators
       INNER JOIN audit_logs ON audit_logs.user_id = local_operators.id
       ORDER BY local_operators.full_name`,
    )
    .map((row) => ({ id: String(row.id), full_name: String(row.full_name) }));
}

// ============================================================================
// Error Reports
// ============================================================================

export interface LocalErrorReport {
  id: string;
  fingerprint: string;
  message: string;
  stack: string | null;
  source: string;
  severity: string;
  route: string | null;
  url: string | null;
  user_agent: string | null;
  http_status: number | null;
  context: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved: number;
  resolved_at: string | null;
  resolved_by: string | null;
}

export async function listLocalErrorReports(filters: {
  resolved?: boolean;
  source?: string;
  limit?: number;
  offset?: number;
}): Promise<LocalErrorReport[]> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filters.resolved !== undefined) {
    conditions.push("resolved = ?");
    params.push(filters.resolved ? 1 : 0);
  }
  if (filters.source) {
    conditions.push("source = ?");
    params.push(filters.source);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit ?? 50, filters.offset ?? 0);
  const rows = database.select<ScalarRow>(
    `SELECT id, fingerprint, message, stack, source, severity, route, url, user_agent, http_status, context, count, first_seen, last_seen, resolved, resolved_at, resolved_by
     FROM error_reports ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    message: String(row.message),
    stack: row.stack === null ? null : String(row.stack),
    source: String(row.source),
    severity: String(row.severity),
    route: row.route === null ? null : String(row.route),
    url: row.url === null ? null : String(row.url),
    user_agent: row.user_agent === null ? null : String(row.user_agent),
    http_status: row.http_status === null ? null : number(row.http_status),
    context: row.context === null ? null : String(row.context),
    count: number(row.count),
    first_seen: String(row.first_seen),
    last_seen: String(row.last_seen),
    resolved: number(row.resolved),
    resolved_at: row.resolved_at === null ? null : String(row.resolved_at),
    resolved_by: row.resolved_by === null ? null : String(row.resolved_by),
  }));
}

export async function countLocalErrorReports(filters: {
  resolved?: boolean;
  source?: string;
}): Promise<number> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filters.resolved !== undefined) {
    conditions.push("resolved = ?");
    params.push(filters.resolved ? 1 : 0);
  }
  if (filters.source) {
    conditions.push("source = ?");
    params.push(filters.source);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = database.select<ScalarRow>(
    `SELECT COUNT(*) AS count FROM error_reports ${where}`,
    params,
  )[0];
  return number(row?.count);
}

export async function createLocalErrorReport(input: {
  fingerprint: string;
  message: string;
  stack?: string | null;
  source: string;
  severity: string;
  route?: string | null;
  url?: string | null;
  user_agent?: string | null;
  http_status?: number | null;
  context?: string | null;
}): Promise<void> {
  const database = await getLocalSqlite();
  const existing = database.select<ScalarRow>(
    "SELECT id, count FROM error_reports WHERE fingerprint = ?",
    [input.fingerprint],
  )[0];
  if (existing) {
    await database.execute(
      `UPDATE error_reports SET count = count + 1, last_seen = CURRENT_TIMESTAMP, message = ?, stack = ? WHERE fingerprint = ?`,
      [input.message, input.stack ?? null, input.fingerprint],
    );
  } else {
    await database.execute(
      `INSERT INTO error_reports(id, fingerprint, message, stack, source, severity, route, url, user_agent, http_status, context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.fingerprint,
        input.message,
        input.stack ?? null,
        input.source,
        input.severity,
        input.route ?? null,
        input.url ?? null,
        input.user_agent ?? null,
        input.http_status ?? null,
        input.context ?? null,
      ],
    );
  }
}

export async function resolveLocalErrorReport(
  fingerprint: string,
  resolvedBy: string,
): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute(
    `UPDATE error_reports SET resolved = 1, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE fingerprint = ?`,
    [resolvedBy, fingerprint],
  );
}

// ============================================================================
// Incidents
// ============================================================================

export interface LocalIncident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export async function listLocalIncidents(filters: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<LocalIncident[]> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(filters.limit ?? 50, filters.offset ?? 0);
  const rows = database.select<ScalarRow>(
    `SELECT id, title, description, severity, status, created_at, updated_at, resolved_at, resolved_by
     FROM incidents ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    description: row.description === null ? null : String(row.description),
    severity: String(row.severity),
    status: String(row.status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    resolved_at: row.resolved_at === null ? null : String(row.resolved_at),
    resolved_by: row.resolved_by === null ? null : String(row.resolved_by),
  }));
}

export async function createLocalIncident(input: {
  title: string;
  description?: string | null;
  severity: string;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  await database.execute(
    `INSERT INTO incidents(id, title, description, severity, status) VALUES (?, ?, ?, ?, 'open')`,
    [id, input.title, input.description ?? null, input.severity],
  );
  return id;
}

export async function resolveLocalIncident(id: string, resolvedBy: string): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute(
    `UPDATE incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [resolvedBy, id],
  );
}

// ============================================================================
// Barcodes
// ============================================================================

export interface LocalBarcode {
  id: string;
  product_id: string;
  barcode: string;
  label: string | null;
  pack_size: number;
  created_at: string;
  products: { id: string; name: string; sku: string | null; barcode: string | null } | null;
}

export async function listLocalBarcodes(search = "", productId?: string): Promise<LocalBarcode[]> {
  const database = await getLocalSqlite();
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (productId) {
    conditions.push("b.product_id = ?");
    params.push(productId);
  }
  if (search.trim()) {
    conditions.push("(b.barcode LIKE ? COLLATE NOCASE OR b.label LIKE ? COLLATE NOCASE)");
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = database.select<ScalarRow>(
    `SELECT b.id, b.product_id, b.barcode, b.label, b.pack_size, b.created_at,
            p.id AS product_record_id, p.name AS product_name, p.sku AS product_sku,
            p.barcode AS product_barcode
     FROM product_barcodes b LEFT JOIN products p ON p.id = b.product_id
     ${where} ORDER BY b.created_at DESC LIMIT 500`,
    params,
  );
  return rows.map((row) => ({
    id: String(row.id),
    product_id: String(row.product_id),
    barcode: String(row.barcode),
    label: row.label === null ? null : String(row.label),
    pack_size: number(row.pack_size),
    created_at: String(row.created_at),
    products:
      row.product_record_id === null
        ? null
        : {
            id: String(row.product_record_id),
            name: String(row.product_name),
            sku: row.product_sku === null ? null : String(row.product_sku),
            barcode: row.product_barcode === null ? null : String(row.product_barcode),
          },
  }));
}

export async function createLocalBarcode(input: {
  product_id: string;
  barcode: string;
  pack_size?: number;
  label?: string | null;
}): Promise<string> {
  const database = await getLocalSqlite();
  const id = crypto.randomUUID();
  await database.execute(
    `INSERT INTO product_barcodes(id, product_id, barcode, pack_size, label) VALUES (?, ?, ?, ?, ?)`,
    [id, input.product_id, input.barcode, input.pack_size ?? 1, input.label ?? null],
  );
  return id;
}

export async function updateLocalBarcode(
  id: string,
  input: { product_id?: string; pack_size?: number; label?: string | null },
): Promise<void> {
  const database = await getLocalSqlite();
  const fields: string[] = [];
  const params: SqlValue[] = [];
  if (input.product_id !== undefined) {
    fields.push("product_id = ?");
    params.push(input.product_id);
  }
  if (input.pack_size !== undefined) {
    fields.push("pack_size = ?");
    params.push(Math.max(1, input.pack_size));
  }
  if (input.label !== undefined) {
    fields.push("label = ?");
    params.push(input.label);
  }
  if (fields.length === 0) return;
  params.push(id);
  await database.execute(`UPDATE product_barcodes SET ${fields.join(", ")} WHERE id = ?`, params);
}

export async function findLocalProductsByReferences(
  references: string[],
): Promise<Array<{ id: string; name: string; sku: string | null; barcode: string | null }>> {
  if (references.length === 0) return [];
  const database = await getLocalSqlite();
  const placeholders = references.map(() => "?").join(", ");
  return database
    .select<ScalarRow>(
      `SELECT id, name, sku, barcode FROM products
       WHERE is_active = 1 AND (sku IN (${placeholders}) OR barcode IN (${placeholders}))`,
      [...references, ...references],
    )
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sku: row.sku === null ? null : String(row.sku),
      barcode: row.barcode === null ? null : String(row.barcode),
    }));
}

export async function upsertLocalBarcode(input: {
  product_id: string;
  barcode: string;
  pack_size: number;
  label?: string | null;
}): Promise<"created" | "updated"> {
  const database = await getLocalSqlite();
  const existing = database.select<ScalarRow>("SELECT id FROM product_barcodes WHERE barcode = ?", [
    input.barcode,
  ])[0];
  if (!existing) {
    await createLocalBarcode(input);
    return "created";
  }
  await updateLocalBarcode(String(existing.id), input);
  return "updated";
}

export async function deleteLocalBarcode(id: string): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute("DELETE FROM product_barcodes WHERE id = ?", [id]);
}

// ============================================================================
// Z-Report
// ============================================================================

export async function getLocalZReport(date: string): Promise<{
  count: number;
  total: number;
  cash_total: number;
  items_sold: number;
  top_items: Array<{ name: string; qty: number; revenue: number }>;
}> {
  const database = await getLocalSqlite();
  const summary =
    database.select<ScalarRow>(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total,
            COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
             WHERE s.sale_date >= ? AND s.is_quick_sale = 1 AND s.status != 'refunded' AND sp.method = 'cash'), 0) as cash_total
     FROM sales WHERE sale_date >= ? AND is_quick_sale = 1 AND status != 'refunded'`,
      [date, date],
    )[0] ?? {};
  const items = database.select<ScalarRow>(
    `SELECT si.product_name as name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= ? AND s.is_quick_sale = 1 AND s.status != 'refunded'
     GROUP BY si.product_name ORDER BY qty DESC LIMIT 10`,
    [date],
  );
  return {
    count: number(summary.count),
    total: number(summary.total),
    cash_total: number(summary.cash_total),
    items_sold: items.reduce((sum, item) => sum + number(item.qty), 0),
    top_items: items.map((item) => ({
      name: String(item.name),
      qty: number(item.qty),
      revenue: number(item.revenue),
    })),
  };
}

export async function listLocalQuickSalesForZReport(
  from: string,
  to: string,
): Promise<
  Array<{
    id: string;
    invoice_no: string;
    sale_date: string;
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    sale_items: Array<{ quantity: number; products: { name: string } | null }>;
    sale_payments: Array<{ method: string; amount: number }>;
  }>
> {
  const database = await getLocalSqlite();
  const sales = database.select<ScalarRow>(
    `SELECT id, invoice_no, sale_date, subtotal, discount, total, paid FROM sales
     WHERE sale_date >= ? AND sale_date <= ? AND is_quick_sale = 1 AND status != 'refunded'
     ORDER BY sale_date ASC`,
    [from, to],
  );
  return sales.map((sale) => {
    const id = String(sale.id);
    return {
      id,
      invoice_no: String(sale.invoice_no),
      sale_date: String(sale.sale_date),
      subtotal: number(sale.subtotal),
      discount: number(sale.discount),
      total: number(sale.total),
      paid: number(sale.paid),
      sale_items: database
        .select<ScalarRow>("SELECT quantity, product_name FROM sale_items WHERE sale_id = ?", [id])
        .map((item) => ({
          quantity: number(item.quantity),
          products: { name: String(item.product_name) },
        })),
      sale_payments: database
        .select<ScalarRow>("SELECT method, amount FROM sale_payments WHERE sale_id = ?", [id])
        .map((payment) => ({ method: String(payment.method), amount: number(payment.amount) })),
    };
  });
}

export async function recordLocalZReportRun(input: {
  from: string;
  to: string;
  count: number;
  total: number;
}): Promise<void> {
  const database = await getLocalSqlite();
  await database.execute(
    `INSERT INTO audit_logs(id, user_id, action, entity, entity_id, metadata)
     VALUES (?, ?, 'z_report_run', 'sales', NULL, ?)`,
    [
      crypto.randomUUID(),
      getLocalSession()?.user.id ?? null,
      JSON.stringify({ ...input, run_at: new Date().toISOString() }),
    ],
  );
}
