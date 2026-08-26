import { getRadarLayer, MAP_IDS, type MapId, type RadarLayerId } from "../../shared/maps";
import {
  DifficultyPoolSchema,
  QUESTION_DIFFICULTIES,
  QuestionDifficultySchema,
  type QuestionDifficulty,
} from "../../shared/questionDifficulty";
import type { MapPoint } from "../../shared/types";
import type { ServerQuestion } from "../game/questions";

export interface QuestionCatalogMeta {
  version: number;
  updatedAt: string;
}

export interface PublishQuestionInput extends ServerQuestion {
  contentHash: string;
  sourcePreviewId: string | null;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuestionListItem {
  id: string;
  imageAssetKey: string;
  mapId: MapId;
  layerId: RadarLayerId;
  difficulty: QuestionDifficulty;
  correctPoint: MapPoint;
  automaticPoint?: MapPoint;
  worldPosition?: { x: number; y: number; z: number };
  viewAngle?: { pitch: number; yaw: number; roll: number };
  coordinateSource: ServerQuestion["coordinateSource"];
  enabled: boolean;
  contentHash: string | null;
  sourcePreviewId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QuestionRow {
  id: string;
  image_asset_key: string;
  map_id: string;
  layer_id: string;
  difficulty: string;
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

interface CountRow {
  count: number;
}

interface MapCountRow extends CountRow {
  map_id: string;
}

interface DifficultyCountRow extends CountRow {
  difficulty: string;
}

interface CatalogMetaRow {
  version: number;
  updated_at: string;
}

interface ImageAssetRow {
  image_asset_key: string;
}

export interface QuestionDatabase {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

const QUESTION_COLUMNS = `
  id, image_asset_key, map_id, layer_id, difficulty, correct_x, correct_y,
  world_x, world_y, world_z, view_pitch, view_yaw, view_roll,
  automatic_x, automatic_y, coordinate_source, enabled, content_hash,
  source_preview_id, created_at, updated_at
`;

const BUMP_CATALOG_SQL = `
  UPDATE question_catalog_meta
  SET version = version + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1
`;

function requireMapId(value: string): MapId {
  if (!MAP_IDS.includes(value as MapId)) throw new Error(`QUESTION_DATABASE_INVALID_MAP ${value}`);
  return value as MapId;
}

function requireLayerId(mapId: MapId, value: string): RadarLayerId {
  const layer = getRadarLayer(mapId, value);
  if (!layer) throw new Error(`QUESTION_DATABASE_INVALID_LAYER ${mapId}/${value}`);
  return layer.id;
}

function requireDifficulty(value: unknown): QuestionDifficulty {
  const parsed = QuestionDifficultySchema.safeParse(value);
  if (!parsed.success) throw new Error(`QUESTION_DATABASE_INVALID_DIFFICULTY ${String(value)}`);
  return parsed.data;
}

function requireMapPool(mapPool: readonly MapId[]): MapId[] {
  const normalized = mapPool.map((mapId) => requireMapId(mapId));
  if (new Set(normalized).size !== normalized.length) throw new Error("QUESTION_DATABASE_DUPLICATE_MAP");
  return normalized;
}

function requireDifficultyPool(difficultyPool: readonly QuestionDifficulty[]): QuestionDifficulty[] {
  const parsed = DifficultyPoolSchema.safeParse(difficultyPool);
  if (!parsed.success) throw new Error("QUESTION_DATABASE_INVALID_DIFFICULTY_POOL");
  return parsed.data;
}

function boundPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function toServerQuestion(row: QuestionRow): ServerQuestion {
  const correctMapId = requireMapId(row.map_id);
  const correctLayerId = requireLayerId(correctMapId, row.layer_id);
  return {
    id: row.id,
    imageAssetKey: row.image_asset_key,
    correctMapId,
    correctLayerId,
    difficulty: requireDifficulty(row.difficulty),
    correctPoint: { x: row.correct_x, y: row.correct_y },
    ...(row.automatic_x !== null && row.automatic_y !== null
      ? { automaticPoint: { x: row.automatic_x, y: row.automatic_y } }
      : {}),
    ...(row.world_x !== null && row.world_y !== null && row.world_z !== null
      ? { worldPosition: { x: row.world_x, y: row.world_y, z: row.world_z } }
      : {}),
    ...(row.view_pitch !== null && row.view_yaw !== null
      ? { viewAngle: { pitch: row.view_pitch, yaw: row.view_yaw, roll: row.view_roll ?? 0 } }
      : {}),
    coordinateSource: row.coordinate_source,
  };
}

function toListItem(row: QuestionRow): QuestionListItem {
  const question = toServerQuestion(row);
  return {
    id: question.id,
    imageAssetKey: question.imageAssetKey,
    mapId: question.correctMapId,
    layerId: question.correctLayerId,
    difficulty: question.difficulty,
    correctPoint: question.correctPoint,
    ...(question.automaticPoint ? { automaticPoint: question.automaticPoint } : {}),
    ...(question.worldPosition ? { worldPosition: question.worldPosition } : {}),
    ...(question.viewAngle ? { viewAngle: question.viewAngle } : {}),
    coordinateSource: question.coordinateSource,
    enabled: row.enabled === 1,
    contentHash: row.content_hash,
    sourcePreviewId: row.source_preview_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class QuestionRepository {
  constructor(private readonly database: QuestionDatabase) {}

  async countEnabled(): Promise<number> {
    const row = await this.database.prepare("SELECT COUNT(*) AS count FROM questions WHERE enabled = 1").first<CountRow>();
    return row?.count ?? 0;
  }

  async countEnabledForMaps(mapPool: MapId[]): Promise<number> {
    if (mapPool.length === 0) return 0;
    return this.countEnabledForSelection(mapPool, QUESTION_DIFFICULTIES);
  }

  async countEnabledForSelection(
    mapPool: readonly MapId[],
    difficultyPool: readonly QuestionDifficulty[],
  ): Promise<number> {
    const maps = requireMapPool(mapPool);
    const difficulties = requireDifficultyPool(difficultyPool);
    if (maps.length === 0) return 0;
    const mapPlaceholders = boundPlaceholders(maps.length);
    const difficultyPlaceholders = boundPlaceholders(difficulties.length);
    const row = await this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM questions
        WHERE enabled = 1
          AND map_id IN (${mapPlaceholders})
          AND difficulty IN (${difficultyPlaceholders})
      `)
      .bind(...maps, ...difficulties)
      .first<CountRow>();
    return row?.count ?? 0;
  }

  async countEnabledByMap(
    mapPool: readonly MapId[],
    difficultyPool: readonly QuestionDifficulty[] = QUESTION_DIFFICULTIES,
  ): Promise<Partial<Record<MapId, number>>> {
    const maps = requireMapPool(mapPool);
    const difficulties = requireDifficultyPool(difficultyPool);
    if (maps.length === 0) return {};
    const mapPlaceholders = boundPlaceholders(maps.length);
    const difficultyPlaceholders = boundPlaceholders(difficulties.length);
    const result = await this.database
      .prepare(`
        SELECT map_id, COUNT(*) AS count
        FROM questions
        WHERE enabled = 1
          AND map_id IN (${mapPlaceholders})
          AND difficulty IN (${difficultyPlaceholders})
        GROUP BY map_id
      `)
      .bind(...maps, ...difficulties)
      .all<MapCountRow>();
    const byMap: Partial<Record<MapId, number>> = Object.fromEntries(maps.map((mapId) => [mapId, 0]));
    for (const row of result.results) {
      const mapId = requireMapId(row.map_id);
      if (maps.includes(mapId)) byMap[mapId] = row.count;
    }
    return byMap;
  }

  async countEnabledByDifficulty(
    mapPool: readonly MapId[],
    difficultyPool: readonly QuestionDifficulty[],
  ): Promise<Partial<Record<QuestionDifficulty, number>>> {
    const maps = requireMapPool(mapPool);
    const difficulties = requireDifficultyPool(difficultyPool);
    if (maps.length === 0) return {};
    const mapPlaceholders = boundPlaceholders(maps.length);
    const difficultyPlaceholders = boundPlaceholders(difficulties.length);
    const result = await this.database
      .prepare(`
        SELECT difficulty, COUNT(*) AS count
        FROM questions
        WHERE enabled = 1
          AND map_id IN (${mapPlaceholders})
          AND difficulty IN (${difficultyPlaceholders})
        GROUP BY difficulty
      `)
      .bind(...maps, ...difficulties)
      .all<DifficultyCountRow>();
    const byDifficulty: Partial<Record<QuestionDifficulty, number>> = Object.fromEntries(
      difficulties.map((difficulty) => [difficulty, 0]),
    );
    for (const row of result.results) {
      const difficulty = requireDifficulty(row.difficulty);
      if (difficulties.includes(difficulty)) byDifficulty[difficulty] = row.count;
    }
    return byDifficulty;
  }

  async getCatalogMeta(): Promise<QuestionCatalogMeta> {
    const row = await this.database
      .prepare("SELECT version, updated_at FROM question_catalog_meta WHERE id = 1")
      .first<CatalogMetaRow>();
    if (!row) throw new Error("QUESTION_CATALOG_META_MISSING");
    return { version: row.version, updatedAt: row.updated_at };
  }

  async getCatalogVersion(): Promise<number> {
    return (await this.getCatalogMeta()).version;
  }

  async getById(questionId: string): Promise<ServerQuestion | null> {
    const row = await this.database
      .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = ?1`)
      .bind(questionId)
      .first<QuestionRow>();
    return row ? toServerQuestion(row) : null;
  }

  async getListItemById(questionId: string): Promise<QuestionListItem | null> {
    const row = await this.database
      .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = ?1`)
      .bind(questionId)
      .first<QuestionRow>();
    return row ? toListItem(row) : null;
  }

  async getImageAssetKey(questionId: string): Promise<string | null> {
    const row = await this.database
      .prepare("SELECT image_asset_key FROM questions WHERE id = ?1")
      .bind(questionId)
      .first<ImageAssetRow>();
    return row?.image_asset_key ?? null;
  }

  async getRandomEnabled(limit: number): Promise<ServerQuestion[]> {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0) return [];
    const result = await this.database
      .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions WHERE enabled = 1 ORDER BY RANDOM() LIMIT ?1`)
      .bind(safeLimit)
      .all<QuestionRow>();
    return result.results.map(toServerQuestion);
  }

  async getRandomEnabledForMaps(mapPool: MapId[], count: number): Promise<ServerQuestion[]> {
    return this.getRandomEnabledForSelection(mapPool, QUESTION_DIFFICULTIES, count);
  }

  async getRandomEnabledForSelection(
    mapPool: readonly MapId[],
    difficultyPool: readonly QuestionDifficulty[],
    count: number,
  ): Promise<ServerQuestion[]> {
    const safeCount = Math.max(0, Math.floor(count));
    const maps = requireMapPool(mapPool);
    const difficulties = requireDifficultyPool(difficultyPool);
    if (safeCount === 0 || maps.length === 0) return [];
    const mapPlaceholders = boundPlaceholders(maps.length);
    const difficultyPlaceholders = boundPlaceholders(difficulties.length);
    const result = await this.database
      .prepare(`
        SELECT ${QUESTION_COLUMNS}
        FROM questions
        WHERE enabled = 1
          AND map_id IN (${mapPlaceholders})
          AND difficulty IN (${difficultyPlaceholders})
        ORDER BY RANDOM()
        LIMIT ?
      `)
      .bind(...maps, ...difficulties, safeCount)
      .all<QuestionRow>();
    return result.results.map(toServerQuestion);
  }

  async contentHashExists(contentHash: string): Promise<boolean> {
    const row = await this.database
      .prepare("SELECT 1 AS count FROM questions WHERE content_hash = ?1 LIMIT 1")
      .bind(contentHash)
      .first<CountRow>();
    return row !== null;
  }

  async existsByContentHash(contentHash: string): Promise<boolean> {
    return this.contentHashExists(contentHash);
  }

  async publish(input: PublishQuestionInput): Promise<ServerQuestion> {
    const difficulty = requireDifficulty(input.difficulty);
    const now = new Date().toISOString();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    const statement = this.database.prepare(`
      INSERT INTO questions (
        id, image_asset_key, map_id, layer_id, difficulty, correct_x, correct_y,
        world_x, world_y, world_z, view_pitch, view_yaw, view_roll,
        automatic_x, automatic_y, coordinate_source, enabled, content_hash,
        source_preview_id, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
      )
    `).bind(
      input.id,
      input.imageAssetKey,
      input.correctMapId,
      input.correctLayerId,
      difficulty,
      input.correctPoint.x,
      input.correctPoint.y,
      input.worldPosition?.x ?? null,
      input.worldPosition?.y ?? null,
      input.worldPosition?.z ?? null,
      input.viewAngle?.pitch ?? null,
      input.viewAngle?.yaw ?? null,
      input.viewAngle?.roll ?? null,
      input.automaticPoint?.x ?? null,
      input.automaticPoint?.y ?? null,
      input.coordinateSource,
      input.enabled === false ? 0 : 1,
      input.contentHash,
      input.sourcePreviewId,
      createdAt,
      updatedAt,
    );
    await this.database.batch([statement, this.database.prepare(BUMP_CATALOG_SQL)]);
    return { ...input, difficulty };
  }

  async updatePoint(questionId: string, point: MapPoint, coordinateSource: ServerQuestion["coordinateSource"]): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE questions
      SET correct_x = ?2,
          correct_y = ?3,
          coordinate_source = ?4,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1
    `).bind(questionId, point.x, point.y, coordinateSource).run();
    if (result.meta.changes === 0) return false;
    await this.database.prepare(BUMP_CATALOG_SQL).run();
    return true;
  }

  async updateCorrectPoint(
    questionId: string,
    point: MapPoint,
    coordinateSource: ServerQuestion["coordinateSource"],
  ): Promise<boolean> {
    return this.updatePoint(questionId, point, coordinateSource);
  }

  async setEnabled(questionId: string, enabled: boolean): Promise<boolean> {
    const result = await this.database.prepare(`
      UPDATE questions
      SET enabled = ?2,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1 AND enabled != ?2
    `).bind(questionId, enabled ? 1 : 0).run();
    if (result.meta.changes === 0) return false;
    await this.database.prepare(BUMP_CATALOG_SQL).run();
    return true;
  }

  async updateDifficulty(questionId: string, difficultyValue: QuestionDifficulty): Promise<boolean> {
    const difficulty = requireDifficulty(difficultyValue);
    const result = await this.database.prepare(`
      UPDATE questions
      SET difficulty = ?2,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?1 AND difficulty != ?2
    `).bind(questionId, difficulty).run();
    if (result.meta.changes === 0) return false;
    await this.database.prepare(BUMP_CATALOG_SQL).run();
    return true;
  }

  async delete(questionId: string): Promise<boolean> {
    const result = await this.database.prepare("DELETE FROM questions WHERE id = ?1").bind(questionId).run();
    if (result.meta.changes === 0) return false;
    await this.database.prepare(BUMP_CATALOG_SQL).run();
    return true;
  }

  async list(): Promise<QuestionListItem[]> {
    const result = await this.database
      .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions ORDER BY created_at, id`)
      .all<QuestionRow>();
    return result.results.map(toListItem);
  }
}
