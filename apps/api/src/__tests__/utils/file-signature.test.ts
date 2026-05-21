import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  matchesSignature,
  verifyFileSignature,
} from "../../utils/file-signature";

const FIXTURES = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  png: Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]),
  gif87: Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x10, 0x00, 0x10, 0x00,
  ]),
  gif89: Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00,
  ]),
  webp: Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]),
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
  fakeJpeg: Buffer.from("<?xml version='1.0'?>"),
  empty: Buffer.alloc(0),
};

describe("matchesSignature", () => {
  it("accepts a real JPEG", () => {
    expect(matchesSignature(FIXTURES.jpeg, "image/jpeg")).toBe(true);
  });

  it("rejects an XML document declared as JPEG", () => {
    expect(matchesSignature(FIXTURES.fakeJpeg, "image/jpeg")).toBe(false);
  });

  it("accepts both GIF87a and GIF89a", () => {
    expect(matchesSignature(FIXTURES.gif87, "image/gif")).toBe(true);
    expect(matchesSignature(FIXTURES.gif89, "image/gif")).toBe(true);
  });

  it("accepts WEBP regardless of declared file size in bytes 4-7", () => {
    expect(matchesSignature(FIXTURES.webp, "image/webp")).toBe(true);
  });

  it("accepts a real PNG and PDF", () => {
    expect(matchesSignature(FIXTURES.png, "image/png")).toBe(true);
    expect(matchesSignature(FIXTURES.pdf, "application/pdf")).toBe(true);
  });

  it("rejects when the buffer is too short to hold the prefix", () => {
    expect(matchesSignature(FIXTURES.empty, "image/png")).toBe(false);
    expect(matchesSignature(Buffer.from([0xff, 0xd8]), "image/jpeg")).toBe(
      false
    );
  });

  it("does not cross-match between formats", () => {
    expect(matchesSignature(FIXTURES.png, "image/jpeg")).toBe(false);
    expect(matchesSignature(FIXTURES.jpeg, "image/png")).toBe(false);
    expect(matchesSignature(FIXTURES.pdf, "image/webp")).toBe(false);
  });
});

describe("verifyFileSignature", () => {
  const tmpFiles: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tmpFiles.map((p) => fs.promises.unlink(p).catch(() => {}))
    );
  });

  async function tmpWrite(prefix: string, data: Buffer): Promise<string> {
    const file = path.join(
      os.tmpdir(),
      `wim-sig-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.promises.writeFile(file, data);
    tmpFiles.push(file);
    return file;
  }

  it("returns true when the file's bytes match the declared MIME", async () => {
    const file = await tmpWrite("png", FIXTURES.png);
    expect(await verifyFileSignature(file, "image/png")).toBe(true);
  });

  it("returns false when bytes do not match the declared MIME", async () => {
    const file = await tmpWrite("fake", FIXTURES.fakeJpeg);
    expect(await verifyFileSignature(file, "image/jpeg")).toBe(false);
  });

  it("returns false for declared MIMEs we don't allow at all", async () => {
    const file = await tmpWrite("png", FIXTURES.png);
    expect(await verifyFileSignature(file, "text/html")).toBe(false);
  });
});
