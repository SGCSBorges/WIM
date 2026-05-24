import { prisma } from "../../libs/prisma";
import { ArticleService } from "./article.service";

export type ImportRow = {
  name: string;
  model: string;
  description?: string | null;
  price?: number | null;
  locations: string[];
  tags?: string[];
};

export type ImportResult = {
  created: number;
  errors: Array<{ row: number; message: string }>;
};

// Resolve a list of location names to owned ids, creating any that don't
// exist yet. Upsert leans on the (ownerUserId, name) unique constraint so
// repeated names within one import don't duplicate.
async function resolveLocationIds(
  ownerUserId: number,
  names: string[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const loc = await prisma.location.upsert({
      where: { ownerUserId_name: { ownerUserId, name } },
      create: { ownerUserId, name },
      update: {},
      select: { locationId: true },
    });
    ids.push(loc.locationId);
  }
  return ids;
}

async function resolveTagIds(
  ownerUserId: number,
  names: string[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const tag = await prisma.tag.upsert({
      where: { ownerUserId_name: { ownerUserId, name } },
      create: { ownerUserId, name },
      update: {},
      select: { tagId: true },
    });
    ids.push(tag.tagId);
  }
  return ids;
}

// Import rows one at a time so a single bad row doesn't abort the whole batch;
// the caller gets a per-row error report (partial success).
export async function importArticles(
  ownerUserId: number,
  rows: ImportRow[]
): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.name?.trim() || !row.model?.trim()) {
        throw new Error("Name and model are required");
      }
      const locationIds = await resolveLocationIds(
        ownerUserId,
        row.locations ?? []
      );
      if (locationIds.length === 0) {
        throw new Error("At least one location is required");
      }
      const tagIds = await resolveTagIds(ownerUserId, row.tags ?? []);

      await ArticleService.create({
        ownerUserId,
        articleNom: row.name.trim(),
        articleModele: row.model.trim(),
        articleDescription: row.description?.trim() || null,
        purchasePrice: row.price ?? null,
        locationIds,
        tagIds,
      });
      created++;
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "Import failed";
      errors.push({ row: i + 1, message });
    }
  }

  return { created, errors };
}
