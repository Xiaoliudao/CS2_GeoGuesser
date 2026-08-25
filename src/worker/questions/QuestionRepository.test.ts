import { describe, expect, it } from "vitest";
import { QuestionRepository, type PublishQuestionInput, type QuestionDatabase } from "./QuestionRepository";

interface MemoryQuestionRow {
  id: string;
  image_asset_key: string;
  map_id: string;
  layer_id: string;
  correct_x: number;
  correct_y: number;
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  view_pitch: number | null;
  view_yaw: number | null;
  view_roll: number | null;
  automatic_x: number | null;
  automatic_y: number | null;
  coordinate_source: "world-conversion" | "manual-override";
  enabled: number;
  content_hash: string | null;
  source_preview_id: string | null;
  created_at: string;
  updated_at: string;
}

function result<T>(results: T[], changes: number): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: 0,
      changed_db: changes > 0,
      changes,
    },
  };
}

class MemoryStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: MemoryD1Database,
    readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T = Record<string, unknown>>(_colName?: string): Promise<T | null> {
    return this.database.first(this.query, this.values) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return result(this.database.all(this.query, this.values) as T[], 0);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const changes = this.database.run(this.query, this.values);
    return result([], changes);
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(_options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    return [];
  }
}

class MemoryD1Database implements QuestionDatabase {
  readonly rows: MemoryQuestionRow[] = [];
  version = 1;

  prepare(query: string): D1PreparedStatement {
    return new MemoryStatement(this, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const platform of statements) {
      if (!(platform instanceof MemoryStatement)) throw new Error("UNKNOWN_MEMORY_STATEMENT");
      results.push(await platform.run<T>());
    }
    return results;
  }

  first(query: string, values: unknown[]): unknown {
    const sql = this.normalize(query);
    if (sql.includes("COUNT(*) AS count")) {
      const mapValues = sql.includes("map_id IN") ? values.map(String) : null;
      return {
        count: this.rows.filter((row) => row.enabled === 1 && (!mapValues || mapValues.includes(row.map_id))).length,
      };
    }
    if (sql.includes("FROM question_catalog_meta")) {
      return { version: this.version, updated_at: "2026-08-24T00:00:00.000Z" };
    }
    if (sql.includes("SELECT 1 AS count") && sql.includes("content_hash")) {
      return this.rows.some((row) => row.content_hash === values[0]) ? { count: 1 } : null;
    }
    const row = this.rows.find((candidate) => candidate.id === values[0]);
    if (sql.startsWith("SELECT image_asset_key")) return row ? { image_asset_key: row.image_asset_key } : null;
    return row ?? null;
  }

  all(query: string, values: unknown[]): unknown[] {
    const sql = this.normalize(query);
    if (sql.includes("GROUP BY map_id")) {
      return values.map(String).map((mapId) => ({
        map_id: mapId,
        count: this.rows.filter((row) => row.enabled === 1 && row.map_id === mapId).length,
      })).filter((row) => row.count > 0);
    }
    if (sql.includes("ORDER BY RANDOM()")) {
      const usesMapPool = sql.includes("map_id IN");
      const mapValues = usesMapPool ? values.slice(0, -1).map(String) : null;
      const limit = Number(values.at(-1));
      return this.rows
        .filter((row) => row.enabled === 1 && (!mapValues || mapValues.includes(row.map_id)))
        .slice(0, limit);
    }
    if (sql.includes("FROM questions")) return [...this.rows];
    return [];
  }

  run(query: string, values: unknown[]): number {
    const sql = this.normalize(query);
    if (sql.startsWith("INSERT INTO questions")) {
      const id = String(values[0]);
      const contentHash = String(values[16]);
      if (this.rows.some((row) => row.id === id || row.content_hash === contentHash)) {
        throw new Error("UNIQUE constraint failed: questions.content_hash");
      }
      this.rows.push({
        id,
        image_asset_key: String(values[1]),
        map_id: String(values[2]),
        layer_id: String(values[3]),
        correct_x: Number(values[4]),
        correct_y: Number(values[5]),
        world_x: values[6] as number | null,
        world_y: values[7] as number | null,
        world_z: values[8] as number | null,
        view_pitch: values[9] as number | null,
        view_yaw: values[10] as number | null,
        view_roll: values[11] as number | null,
        automatic_x: values[12] as number | null,
        automatic_y: values[13] as number | null,
        coordinate_source: values[14] as MemoryQuestionRow["coordinate_source"],
        enabled: Number(values[15]),
        content_hash: contentHash,
        source_preview_id: values[17] as string | null,
        created_at: String(values[18]),
        updated_at: String(values[19]),
      });
      return 1;
    }
    if (sql.startsWith("UPDATE question_catalog_meta")) {
      this.version += 1;
      return 1;
    }
    if (sql.startsWith("UPDATE questions") && sql.includes("SET enabled")) {
      const row = this.rows.find((candidate) => candidate.id === values[0]);
      if (!row || row.enabled === Number(values[1])) return 0;
      row.enabled = Number(values[1]);
      return 1;
    }
    if (sql.startsWith("UPDATE questions") && sql.includes("SET correct_x")) {
      const row = this.rows.find((candidate) => candidate.id === values[0]);
      if (!row) return 0;
      row.correct_x = Number(values[1]);
      row.correct_y = Number(values[2]);
      row.coordinate_source = values[3] as MemoryQuestionRow["coordinate_source"];
      return 1;
    }
    if (sql.startsWith("DELETE FROM questions")) {
      const index = this.rows.findIndex((candidate) => candidate.id === values[0]);
      if (index < 0) return 0;
      this.rows.splice(index, 1);
      return 1;
    }
    return 0;
  }

  private normalize(query: string): string {
    return query.replace(/\s+/g, " ").trim();
  }
}

function databaseAndRepository(): { database: MemoryD1Database; repository: QuestionRepository } {
  const database = new MemoryD1Database();
  return { database, repository: new QuestionRepository(database) };
}

function question(id: string, hash: string, mapId: PublishQuestionInput["correctMapId"] = "mirage"): PublishQuestionInput {
  return {
    id,
    imageAssetKey: `questions/${id}.webp`,
    correctMapId: mapId,
    correctLayerId: "main",
    correctPoint: { x: 0.4, y: 0.6 },
    automaticPoint: { x: 0.4, y: 0.6 },
    worldPosition: { x: 10, y: 20, z: 30 },
    coordinateSource: "world-conversion",
    contentHash: hash,
    sourcePreviewId: `preview-${id}`,
  };
}

describe("QuestionRepository", () => {
  it("inserts, fetches, counts, and increments the catalog version", async () => {
    const { repository } = databaseAndRepository();
    await repository.publish(question("q-repository0001", "hash-1"));

    expect(await repository.countEnabled()).toBe(1);
    expect(await repository.getById("q-repository0001")).toMatchObject({
      id: "q-repository0001",
      imageAssetKey: "questions/q-repository0001.webp",
      correctMapId: "mirage",
      correctPoint: { x: 0.4, y: 0.6 },
    });
    expect(await repository.getImageAssetKey("q-repository0001")).toBe("questions/q-repository0001.webp");
    expect((await repository.getCatalogMeta()).version).toBe(2);
  });

  it("disables and re-enables questions dynamically", async () => {
    const { repository } = databaseAndRepository();
    await repository.publish(question("q-repository0002", "hash-2"));
    await expect(repository.setEnabled("q-repository0002", false)).resolves.toBe(true);
    expect(await repository.countEnabled()).toBe(0);
    await expect(repository.setEnabled("q-repository0002", true)).resolves.toBe(true);
    expect(await repository.countEnabled()).toBe(1);
    expect((await repository.getCatalogMeta()).version).toBe(4);
  });

  it("detects duplicate content hashes and rejects a duplicate insert", async () => {
    const { repository } = databaseAndRepository();
    await repository.publish(question("q-repository0003", "same-hash"));
    await expect(repository.contentHashExists("same-hash")).resolves.toBe(true);
    await expect(repository.publish(question("q-repository0004", "same-hash"))).rejects.toThrow("UNIQUE constraint");
  });

  it("selects enabled questions without duplicates per match", async () => {
    const { repository } = databaseAndRepository();
    await repository.publish(question("q-repository0005", "hash-5"));
    await repository.publish(question("q-repository0006", "hash-6"));
    await repository.publish(question("q-repository0007", "hash-7"));
    await repository.setEnabled("q-repository0007", false);

    const selected = await repository.getRandomEnabled(5);
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((candidate) => candidate.id)).size).toBe(selected.length);
    expect(selected.map((candidate) => candidate.id)).not.toContain("q-repository0007");
  });

  it("counts availability only for the selected map pool", async () => {
    const { repository } = databaseAndRepository();
    for (let index = 0; index < 8; index += 1) {
      await repository.publish(question(`q-mirage-${String(index).padStart(4, "0")}`, `mirage-${index}`, "mirage"));
    }
    for (let index = 0; index < 4; index += 1) {
      await repository.publish(question(`q-inferno-${String(index).padStart(4, "0")}`, `inferno-${index}`, "inferno"));
    }
    for (let index = 0; index < 2; index += 1) {
      await repository.publish(question(`q-ancient-${String(index).padStart(4, "0")}`, `ancient-${index}`, "ancient"));
    }

    await expect(repository.countEnabledForMaps(["mirage"])).resolves.toBe(8);
    await expect(repository.countEnabledForMaps(["mirage", "inferno"])).resolves.toBe(12);
    await expect(repository.countEnabledForMaps(["ancient"])).resolves.toBe(2);
    await expect(repository.countEnabledByMap(["mirage", "inferno"])).resolves.toEqual({ mirage: 8, inferno: 4 });
  });

  it("selects the requested number of unique questions only from the selected maps", async () => {
    const { repository } = databaseAndRepository();
    for (let index = 0; index < 6; index += 1) {
      await repository.publish(question(`q-pool-m-${String(index).padStart(4, "0")}`, `pool-m-${index}`, "mirage"));
      await repository.publish(question(`q-pool-i-${String(index).padStart(4, "0")}`, `pool-i-${index}`, "inferno"));
      await repository.publish(question(`q-pool-a-${String(index).padStart(4, "0")}`, `pool-a-${index}`, "ancient"));
    }

    const selected = await repository.getRandomEnabledForMaps(["mirage", "inferno"], 10);
    expect(selected).toHaveLength(10);
    expect(new Set(selected.map((candidate) => candidate.id)).size).toBe(10);
    expect(selected.every((candidate) => ["mirage", "inferno"].includes(candidate.correctMapId))).toBe(true);
  });
});
