import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { resolveJamaicaDeliveryZone } from "./jamaicaDeliveryZones.js";

let sqlClient: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

function sql() {
  if (!sqlClient) {
    const url = process.env.SMARTCOMMERCE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("COMMERCE_DATABASE_NOT_CONFIGURED");
    sqlClient = neon(url);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS customer_delivery_addresses (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          label TEXT,
          address_type TEXT NOT NULL DEFAULT 'home',
          site_name TEXT,
          recipient_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          line1 TEXT NOT NULL,
          line2 TEXT,
          city TEXT NOT NULL,
          region TEXT NOT NULL,
          postal_code TEXT,
          country_code TEXT NOT NULL DEFAULT 'JM',
          notes TEXT,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          zone_status TEXT,
          zone_class TEXT,
          zone_source TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql()`CREATE INDEX IF NOT EXISTS customer_delivery_addresses_customer_idx ON customer_delivery_addresses(customer_id, is_default DESC, updated_at DESC)`;
    })();
  }
  await schemaReady;
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export type CustomerDeliveryAddressInput = {
  id?: string;
  label?: string;
  type?: "home" | "business" | "job_site";
  siteName?: string;
  recipientName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
  isDefault?: boolean;
};

export function normalizeCustomerDeliveryAddress(raw: CustomerDeliveryAddressInput) {
  const address = {
    label: clean(raw.label, 80),
    type: raw.type === "business" || raw.type === "job_site" ? raw.type : "home" as const,
    siteName: clean(raw.siteName, 120),
    recipientName: clean(raw.recipientName, 120),
    phone: clean(raw.phone, 40),
    line1: clean(raw.line1, 180),
    line2: clean(raw.line2, 180),
    city: clean(raw.city, 100),
    region: clean(raw.region, 100),
    postalCode: clean(raw.postalCode, 30),
    countryCode: clean(raw.countryCode || "JM", 2).toUpperCase(),
    notes: clean(raw.notes, 500),
  };
  if (!address.recipientName || !address.phone || !address.line1 || !address.city || !address.region || address.countryCode !== "JM") {
    throw Object.assign(new Error("DELIVERY_ADDRESS_INCOMPLETE"), { status: 400 });
  }
  return address;
}

function mapRow(row: any) {
  return {
    id: String(row.id),
    label: row.label || "",
    type: row.address_type || "home",
    siteName: row.site_name || "",
    recipientName: row.recipient_name || "",
    phone: row.phone || "",
    line1: row.line1 || "",
    line2: row.line2 || "",
    city: row.city || "",
    region: row.region || "",
    postalCode: row.postal_code || "",
    countryCode: row.country_code || "JM",
    notes: row.notes || "",
    isDefault: Boolean(row.is_default),
    zoneStatus: row.zone_status || null,
    zoneClass: row.zone_class || null,
    zoneSource: row.zone_source || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCustomerDeliveryAddresses(customerId: string) {
  await ensureSchema();
  const rows = await sql()`
    SELECT * FROM customer_delivery_addresses
    WHERE customer_id = ${customerId}
    ORDER BY is_default DESC, updated_at DESC
    LIMIT 50
  ` as any[];
  return rows.map(mapRow);
}

export async function saveCustomerDeliveryAddress(customerId: string, input: CustomerDeliveryAddressInput) {
  await ensureSchema();
  const address = normalizeCustomerDeliveryAddress(input);
  const zone = resolveJamaicaDeliveryZone({ town: address.city, parish: address.region });
  const id = clean(input.id, 80) || `addr_${randomBytes(16).toString("hex")}`;
  const existing = await sql()`SELECT id FROM customer_delivery_addresses WHERE id = ${id} AND customer_id = ${customerId} LIMIT 1` as any[];
  if (input.id && !existing[0]) throw Object.assign(new Error("DELIVERY_ADDRESS_NOT_FOUND"), { status: 404 });

  if (input.isDefault) {
    await sql()`UPDATE customer_delivery_addresses SET is_default = FALSE, updated_at = NOW() WHERE customer_id = ${customerId}`;
  }

  const rows = await sql()`
    INSERT INTO customer_delivery_addresses (
      id, customer_id, label, address_type, site_name, recipient_name, phone,
      line1, line2, city, region, postal_code, country_code, notes,
      is_default, zone_status, zone_class, zone_source
    ) VALUES (
      ${id}, ${customerId}, ${address.label || null}, ${address.type}, ${address.siteName || null}, ${address.recipientName}, ${address.phone},
      ${address.line1}, ${address.line2 || null}, ${address.city}, ${address.region}, ${address.postalCode || null}, ${address.countryCode}, ${address.notes || null},
      ${Boolean(input.isDefault)}, ${zone.status}, ${zone.status === "resolved" ? zone.destinationClass : null}, ${zone.source}
    )
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      address_type = EXCLUDED.address_type,
      site_name = EXCLUDED.site_name,
      recipient_name = EXCLUDED.recipient_name,
      phone = EXCLUDED.phone,
      line1 = EXCLUDED.line1,
      line2 = EXCLUDED.line2,
      city = EXCLUDED.city,
      region = EXCLUDED.region,
      postal_code = EXCLUDED.postal_code,
      country_code = EXCLUDED.country_code,
      notes = EXCLUDED.notes,
      is_default = EXCLUDED.is_default,
      zone_status = EXCLUDED.zone_status,
      zone_class = EXCLUDED.zone_class,
      zone_source = EXCLUDED.zone_source,
      updated_at = NOW()
    WHERE customer_delivery_addresses.customer_id = ${customerId}
    RETURNING *
  ` as any[];
  return { address: mapRow(rows[0]), zone };
}

export async function deleteCustomerDeliveryAddress(customerId: string, id: string) {
  await ensureSchema();
  const rows = await sql()`DELETE FROM customer_delivery_addresses WHERE id = ${id} AND customer_id = ${customerId} RETURNING id` as any[];
  if (!rows[0]) throw Object.assign(new Error("DELIVERY_ADDRESS_NOT_FOUND"), { status: 404 });
  return { id: String(rows[0].id) };
}

export async function setDefaultCustomerDeliveryAddress(customerId: string, id: string) {
  await ensureSchema();
  const found = await sql()`SELECT id FROM customer_delivery_addresses WHERE id = ${id} AND customer_id = ${customerId} LIMIT 1` as any[];
  if (!found[0]) throw Object.assign(new Error("DELIVERY_ADDRESS_NOT_FOUND"), { status: 404 });
  await sql()`UPDATE customer_delivery_addresses SET is_default = FALSE, updated_at = NOW() WHERE customer_id = ${customerId}`;
  const rows = await sql()`UPDATE customer_delivery_addresses SET is_default = TRUE, updated_at = NOW() WHERE id = ${id} AND customer_id = ${customerId} RETURNING *` as any[];
  return mapRow(rows[0]);
}
