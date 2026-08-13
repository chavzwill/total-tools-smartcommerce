import type { Client } from "@libsql/client";
import type {
  AdaptiveProfileRepository,
  PersistedAdaptiveProviderProfile,
} from "../platform/adaptiveProfileLifecycle";

const TABLE_NAME = "smartcommerce_adaptive_provider_profiles";

export class LibsqlAdaptiveProfileRepository implements AdaptiveProfileRepository {
  private ready?: Promise<void>;

  constructor(private readonly client: Client) {}

  private ensureReady() {
    if (!this.ready) this.ready = this.initialize();
    return this.ready;
  }

  private async initialize() {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        business_account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        connection_id TEXT,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        profile_json TEXT NOT NULL
      )
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_sc_adaptive_profiles_account_provider
      ON ${TABLE_NAME} (business_account_id, provider_id)
    `);
  }

  async load(profileId: string) {
    await this.ensureReady();
    const result = await this.client.execute({
      sql: `SELECT profile_json FROM ${TABLE_NAME} WHERE id = ? LIMIT 1`,
      args: [profileId],
    });
    const row = result.rows[0];
    if (!row) return undefined;
    if (typeof row.profile_json !== "string") {
      throw new Error(`Adaptive profile ${profileId} has invalid persisted JSON.`);
    }
    return JSON.parse(row.profile_json) as PersistedAdaptiveProviderProfile;
  }

  async save(profile: PersistedAdaptiveProviderProfile) {
    await this.ensureReady();
    await this.client.execute({
      sql: `
        INSERT INTO ${TABLE_NAME} (
          id, business_account_id, provider_id, connection_id,
          revision, updated_at, profile_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          business_account_id = excluded.business_account_id,
          provider_id = excluded.provider_id,
          connection_id = excluded.connection_id,
          revision = excluded.revision,
          updated_at = excluded.updated_at,
          profile_json = excluded.profile_json
      `,
      args: [
        profile.id,
        profile.businessAccountId,
        profile.providerId,
        profile.connectionId || null,
        profile.revision,
        profile.updatedAt,
        JSON.stringify(profile),
      ],
    });
  }

  async remove(profileId: string) {
    await this.ensureReady();
    await this.client.execute({
      sql: `DELETE FROM ${TABLE_NAME} WHERE id = ?`,
      args: [profileId],
    });
  }
}
