import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
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
  dryRun?: boolean;
};

// Ceiling on how many *new* locations/tags a single import may auto-create.
// Guards against a malformed file (e.g. a misaligned column) silently
// spawning hundreds of junk locations/tags.
const MAX_NEW_PER_IMPORT = 50;

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

// Distinct, trimmed, non-empty names pulled from a column accessor across rows.
function distinctNames(rows: ImportRow[], pick: (r: ImportRow) => string[]) {
  const set = new Set<string>();
  for (const r of rows)
    for (const raw of pick(r) ?? []) {
      const n = raw.trim();
      if (n) set.add(n);
    }
  return set;
}

// Reject the whole import up front if it would auto-create more than
// MAX_NEW_PER_IMPORT new locations or tags. Names already owned don't count.
async function assertNewEntityCap(ownerUserId: number, rows: ImportRow[]) {
  const check = async (
    names: Set<string>,
    existing: Set<string>,
    label: string
  ) => {
    let newCount = 0;
    for (const n of names) if (!existing.has(n)) newCount++;
    if (newCount > MAX_NEW_PER_IMPORT) {
      throw createHttpError(
        400,
        `This import would create ${newCount} new ${label} (max ${MAX_NEW_PER_IMPORT}). Pre-create them or split the import.`
      );
    }
  };

  const locationNames = distinctNames(rows, (r) => r.locations);
  const tagNames = distinctNames(rows, (r) => r.tags ?? []);

  const [existingLocations, existingTags] = await Promise.all([
    locationNames.size
      ? prisma.location.findMany({
          where: { ownerUserId, name: { in: [...locationNames] } },
          select: { name: true },
        })
      : Promise.resolve([]),
    tagNames.size
      ? prisma.tag.findMany({
          where: { ownerUserId, name: { in: [...tagNames] } },
          select: { name: true },
        })
      : Promise.resolve([]),
  ]);

  await check(
    locationNames,
    new Set(existingLocations.map((l) => l.name)),
    "locations"
  );
  await check(tagNames, new Set(existingTags.map((t) => t.name)), "tags");
}

// Import rows one at a time so a single bad row doesn't abort the whole batch;
// the caller gets a per-row error report (partial success). With dryRun, rows
// are validated but nothing is written — used to power a server-validated
// preview before the real commit.
export async function importArticles(
  ownerUserId: number,
  rows: ImportRow[],
  opts: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const dryRun = opts.dryRun === true;
  const errors: ImportResult["errors"] = [];
  let created = 0;

  await assertNewEntityCap(ownerUserId, rows);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.name?.trim() || !row.model?.trim()) {
        throw new Error("Name and model are required");
      }
      const hasLocation = (row.locations ?? []).some((l) => l.trim());
      if (!hasLocation) {
        throw new Error("At least one location is required");
      }

      // Dry run validates structure only; defer all writes to the real import.
      if (dryRun) {
        created++;
        continue;
      }

      const locationIds = await resolveLocationIds(
        ownerUserId,
        row.locations ?? []
      );
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

  return { created, errors, dryRun };
}
