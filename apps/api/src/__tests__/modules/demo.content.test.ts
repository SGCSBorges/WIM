/**
 * French that a French jury reads on screen: owner names elide ("d'Emma"),
 * notes agree with the thing they describe ("Offerte pour Noël" for a
 * watch), and the catalogue facts the seeder relies on hold (end-of-sale
 * dates after release; mixed categories buy from shops that sell the item).
 */
import { describe, it, expect } from "vitest";
import { CATALOG } from "../../modules/demo/demo.catalog";
import * as C from "../../modules/demo/demo.content";

describe("owner names", () => {
  it("elide 'de' before a vowel or a mute h, not before a consonant or Y", () => {
    expect(C.deName("Jules")).toBe("de Jules");
    expect(C.deName("Emma")).toBe("d'Emma");
    expect(C.deName("Élodie")).toBe("d'Élodie");
    expect(C.deName("Hugo")).toBe("d'Hugo");
    expect(C.deName("Yanis")).toBe("de Yanis");
    expect(C.WITH_OWNER.fr("iPhone 13", "Alexandre")).toBe(
      "iPhone 13 d'Alexandre"
    );
  });
});

describe("agreement of French notes", () => {
  it("knows the gender and number of the catalogue's nouns", () => {
    const form = (key: string) =>
      C.frForm(CATALOG.find((i) => i.key === key)!.noun.fr);
    expect(form("aw9")).toBe("f"); // montre
    expect(form("switch2")).toBe("f"); // console
    expect(form("airpods4")).toBe("mp"); // écouteurs
    expect(form("skis")).toBe("mp");
    expect(form("docs")).toBe("fp"); // boots
    expect(form("bosch-sms6")).toBe("m"); // lave-vaisselle
  });

  it("fills every token for every form", () => {
    const t =
      "{Remplace|Remplacent} {l'ancien/l'ancienne/les anciens/les anciennes}, tombé{e} en panne.";
    expect(C.agree(t, "m")).toBe("Remplace l'ancien, tombé en panne.");
    expect(C.agree(t, "f")).toBe("Remplace l'ancienne, tombée en panne.");
    expect(C.agree(t, "mp")).toBe("Remplacent les anciens, tombés en panne.");
    expect(C.agree(t, "fp")).toBe(
      "Remplacent les anciennes, tombées en panne."
    );
    expect(C.agree("Got it 20% off.", "f")).toBe("Got it 20% off.");
  });

  // Every French line the seeder can attach to an article, rendered for a
  // feminine thing: no token left over, and no participle left masculine.
  const MASCULINE =
    /\b(Acheté|Rangé|Pris|Gravé|Monté|Offert|Utilisé|Livré|Installé|Vendu|Revendu|Repris|Donné|Perdu|Oublié|volé|Tombé|Déposé|Récupéré|Ajouté|Prêté|Rendu|Fixé|Configuré|Remisé|Porté|Farté|Accordé|Encadré|Homologué|Racheté|rangé|utilisé|Échangé|Réparé|envoyé|recyclé|retrouvé|trouvé)(?=[ ,.])/;
  const lines = [
    ...Object.values(C.DESCRIPTIONS).flatMap((ds) => ds.map((d) => d.fr)),
    ...C.GIFT_DESCRIPTIONS.fr,
    ...C.SECOND_HAND_DESCRIPTIONS.fr.person,
    ...C.SECOND_HAND_DESCRIPTIONS.fr.platform.map((f) => f("Le Bon Coin")),
    C.CASUAL_PURCHASE_NOTE.fr("Darty", false, 24),
    ...C.SOLD_NOTES.fr.map((f) => f("200 €")),
    ...C.DISPOSED_NOTES.fr,
    ...C.LOST_NOTES.fr,
    ...C.CLAIM_NOTES.fr.open,
    ...C.CLAIM_NOTES.fr.resolved,
    ...Object.values(C.NOTE_TEXTS).flatMap((n) => n.fr),
    ...C.LOAN_RETURN_NOTES.fr,
    ...C.FOUND_REPORTS.fr.map((r) => r.message),
  ];

  it.each(["f", "fp"] as const)("reads right for a %s noun", (form) => {
    for (const line of lines) {
      const said = C.agree(line, form);
      expect(said.replace("{n}", ""), line).not.toMatch(/[{}]/);
      expect(said, line).not.toMatch(MASCULINE);
    }
  });
});

describe("catalogue facts", () => {
  it("stops selling a model after it was released", () => {
    for (const item of CATALOG.filter((i) => i.discontinued)) {
      expect(item.discontinued, item.key).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(item.released, item.key).toBeDefined();
      expect(item.discontinued! > item.released!, item.key).toBe(true);
    }
  });

  it("buys a collectible or a miscellaneous thing where that thing is sold", () => {
    // These two categories mix guitars, a pen, a camera, a toy, luggage, a
    // barbecue and baby gear: a shared shop list would sell a Montblanc in
    // a music shop, so every item in them names its own shops.
    for (const item of CATALOG.filter(
      (i) => i.category === "COLLECTIBLE" || i.category === "OTHER"
    ))
      expect(C.SHOP_OVERRIDES[item.key]?.fr.length, item.key).toBeGreaterThan(
        0
      );
    expect(
      C.RETAILERS.CLOTHING.fr.map((r) => r.name),
      "Decathlon sells its own brands, not Hugo Boss"
    ).not.toContain("Decathlon");
  });
});
