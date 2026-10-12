import fs from "fs";
import path from "path";
import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { CATALOG } from "../../modules/demo/demo.catalog";
import { DEMO_PHOTOS, PHOTO_DIR } from "../../modules/demo/demo.photos";

const FREE_LICENCES =
  /^(CC0( 1\.0)?|Public domain|CC BY(-SA)? (2\.0|2\.5|3\.0|4\.0))$/;
const byKey = new Map(CATALOG.map((i) => [i.key, i]));
const entries = Object.entries(DEMO_PHOTOS).flatMap(([key, photos]) =>
  photos.map((photo) => ({ key, photo }))
);

describe("demo product photos", () => {
  it("are credited Commons images of catalogue products", () => {
    for (const { key, photo } of entries) {
      expect(byKey.has(key), key).toBe(true);
      expect(photo.author.trim(), key).not.toBe("");
      expect(photo.licence, key).toMatch(FREE_LICENCES);
      expect(photo.source, key).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/
      );
    }
  });

  it("are committed, resized JPEGs, and nothing else sits beside them", async () => {
    const referenced = new Set(entries.map((e) => e.photo.file));
    for (const file of referenced) {
      const bytes = fs.readFileSync(path.join(PHOTO_DIR, file));
      const meta = await sharp(bytes).metadata();
      expect(meta.format, file).toBe("jpeg");
      expect(Math.max(meta.width!, meta.height!), file).toBeLessThanOrEqual(
        1280
      );
      expect(bytes.length, file).toBeLessThan(400 * 1024);
    }
    const onDisk = fs.existsSync(PHOTO_DIR)
      ? fs.readdirSync(PHOTO_DIR).filter((f) => f !== "CREDITS.md")
      : [];
    expect(onDisk.sort()).toEqual([...referenced].sort());
  });

  it("are all listed in CREDITS.md", () => {
    if (!entries.length) return;
    const credits = fs.readFileSync(path.join(PHOTO_DIR, "CREDITS.md"), "utf8");
    for (const { photo } of entries) {
      expect(credits).toContain(photo.source);
      expect(credits).toContain(photo.author);
    }
  });

  // A similar product's photo may show a colour the model never came in;
  // it then names none, and the article's colour comes from the model.
  it("show a colour the model was actually sold in", () => {
    for (const { key, photo } of entries) {
      const item = byKey.get(key)!;
      if (!item.fields?.includes("colour")) continue;
      if (photo.similar && !photo.colour) continue;
      expect(photo.colour, key).toBeDefined();
      const k = item.colours!.fr.indexOf(photo.colour!.fr);
      expect(k, `${key}: ${photo.colour!.fr}`).toBeGreaterThanOrEqual(0);
      expect(item.colours!.en[k], key).toBe(photo.colour!.en);
    }
  });
});

describe("catalogue colours", () => {
  it("lists real colourways, in both languages, for every product with a colour field", () => {
    for (const item of CATALOG) {
      if (!item.fields?.includes("colour")) continue;
      expect(item.colours, item.key).toBeDefined();
      expect(item.colours!.fr.length, item.key).toBeGreaterThan(0);
      expect(item.colours!.en.length, item.key).toBe(item.colours!.fr.length);
    }
  });
});
