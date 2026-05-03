/**
 * Compile-time assertions that Prisma model shapes remain structurally
 * compatible with the wire types in `@wim/types`. If a schema change
 * removes/renames a field that the web app depends on, this file fails to
 * type-check and CI catches the drift.
 *
 * Add a new line here whenever you expose a Prisma model on the wire.
 */

import type {
  Location as PrismaLocation,
  Garantie as PrismaGarantie,
} from "@prisma/client";
import type { Location, ArticleWarranty } from "@wim/types";

type AssertAssignable<From, To> = From extends To ? true : never;

// Each line below produces a compile error if the Prisma model loses a
// field that `@wim/types` requires.
export const _locationCompat: AssertAssignable<
  Pick<PrismaLocation, "locationId" | "name">,
  Location
> = true;

export const _warrantyCompat: AssertAssignable<
  Pick<
    PrismaGarantie,
    "garantieId" | "garantieNom" | "garantieDateAchat" | "garantieDuration"
  > & { garantieDateAchat: string },
  Pick<
    ArticleWarranty,
    "garantieId" | "garantieNom" | "garantieDateAchat" | "garantieDuration"
  >
> = true;
