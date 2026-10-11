/**
 * Everything a demo user would have typed, in the two languages the seeded
 * population writes in. A French account gets French rooms, tags, notes and
 * messages; an English-speaking expat gets English ones. Mixed-language rows
 * inside one account are the quickest way to give a demo away.
 *
 * Only French and English are authored here: these are sentences, and the
 * PT/ES/NL copy in this project is still waiting on a native review (see the
 * open items in docs/conventions.md). The app's UI still offers all five.
 */
import type { BundleKey, Category, FieldKey, RoomKey } from "./demo.catalog";
import { pick } from "./demo.random";

export type Lang = "fr" | "en";
type L<T> = Record<Lang, T>;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export const FIRST_NAMES: L<string[]> = {
  fr: [
    "Camille",
    "Léa",
    "Manon",
    "Chloé",
    "Emma",
    "Inès",
    "Sarah",
    "Julie",
    "Pauline",
    "Marion",
    "Claire",
    "Anaïs",
    "Laura",
    "Élodie",
    "Mathilde",
    "Juliette",
    "Lucie",
    "Margaux",
    "Céline",
    "Sophie",
    "Thomas",
    "Nicolas",
    "Julien",
    "Maxime",
    "Antoine",
    "Alexandre",
    "Romain",
    "Guillaume",
    "Hugo",
    "Lucas",
    "Pierre",
    "Mathieu",
    "Florian",
    "Kevin",
    "Benjamin",
    "Quentin",
    "Adrien",
    "Vincent",
    "Sébastien",
    "Arnaud",
    "Karim",
    "Yanis",
    "Nadia",
    "Amine",
    "Sofia",
    "Mehdi",
  ],
  en: [
    "Emily",
    "Charlotte",
    "Olivia",
    "Hannah",
    "Sophie",
    "Grace",
    "Lucy",
    "Amelia",
    "Rachel",
    "Megan",
    "James",
    "Oliver",
    "Thomas",
    "Daniel",
    "Matthew",
    "Samuel",
    "Jack",
    "Harry",
    "Joseph",
    "Ryan",
    "Priya",
    "Aisha",
    "Connor",
    "Liam",
    "Niamh",
    "Siobhan",
  ],
};

export const LAST_NAMES: L<string[]> = {
  fr: [
    "Martin",
    "Bernard",
    "Dubois",
    "Thomas",
    "Robert",
    "Richard",
    "Petit",
    "Durand",
    "Leroy",
    "Moreau",
    "Simon",
    "Laurent",
    "Lefebvre",
    "Michel",
    "Garcia",
    "David",
    "Bertrand",
    "Roux",
    "Vincent",
    "Fournier",
    "Morel",
    "Girard",
    "André",
    "Lefèvre",
    "Mercier",
    "Dupont",
    "Lambert",
    "Bonnet",
    "François",
    "Martinez",
    "Legrand",
    "Garnier",
    "Faure",
    "Rousseau",
    "Blanc",
    "Guérin",
    "Muller",
    "Henry",
    "Roussel",
    "Nicolas",
    "Perrin",
    "Morin",
    "Mathieu",
    "Clément",
    "Gauthier",
    "Dumont",
    "Lopez",
    "Fontaine",
    "Chevalier",
    "Robin",
    "Benali",
    "Haddad",
    "Nguyen",
    "Da Silva",
    "Pereira",
  ],
  en: [
    "Smith",
    "Jones",
    "Taylor",
    "Brown",
    "Williams",
    "Wilson",
    "Johnson",
    "Davies",
    "Evans",
    "Thomas",
    "Roberts",
    "Walker",
    "Wright",
    "Robinson",
    "Thompson",
    "White",
    "Hughes",
    "Edwards",
    "Green",
    "Hall",
    "Murphy",
    "O'Brien",
    "Kelly",
    "Patel",
    "Shah",
    "Campbell",
  ],
};

/** Strip accents and punctuation for an e-mail local part. */
export function emailSafe(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();
}

export function householdName(lang: Lang, last: string): string {
  return lang === "fr" ? `Famille ${last}` : `The ${last} household`;
}

// ---------------------------------------------------------------------------
// Rooms — each user settles on one wording per room and keeps it
// ---------------------------------------------------------------------------
export const ROOM_NAMES: Record<RoomKey, L<string[]>> = {
  living: {
    fr: ["Salon", "Séjour", "Pièce à vivre"],
    en: ["Living room", "Lounge", "Sitting room"],
  },
  dining: { fr: ["Salle à manger"], en: ["Dining room"] },
  kitchen: { fr: ["Cuisine"], en: ["Kitchen"] },
  bedroom: {
    fr: ["Chambre", "Chambre parentale", "Notre chambre"],
    en: ["Bedroom", "Main bedroom", "Master bedroom"],
  },
  kids: {
    fr: ["Chambre des enfants", "Chambre des petits"],
    en: ["Kids' room", "Children's bedroom"],
  },
  guest: {
    fr: ["Chambre d'amis", "Bureau / chambre d'amis"],
    en: ["Spare room", "Guest room"],
  },
  office: {
    fr: ["Bureau", "Coin bureau"],
    en: ["Home office", "Study", "Office"],
  },
  dressing: {
    fr: ["Dressing", "Placard de l'entrée"],
    en: ["Wardrobe", "Dressing room"],
  },
  bathroom: { fr: ["Salle de bain"], en: ["Bathroom"] },
  laundry: { fr: ["Buanderie", "Cellier"], en: ["Utility room", "Laundry"] },
  entry: { fr: ["Entrée", "Couloir"], en: ["Hallway", "Entrance"] },
  cellar: { fr: ["Cave", "Sous-sol"], en: ["Cellar", "Basement"] },
  garage: { fr: ["Garage"], en: ["Garage"] },
  attic: { fr: ["Grenier", "Combles"], en: ["Loft", "Attic"] },
  shed: { fr: ["Abri de jardin", "Cabanon"], en: ["Garden shed", "Shed"] },
  garden: { fr: ["Jardin", "Terrasse"], en: ["Garden", "Patio"] },
  balcony: { fr: ["Balcon"], en: ["Balcony"] },
  safe: { fr: ["Coffre-fort"], en: ["Safe"] },
};

/** Rooms an apartment has; a house adds the rest. */
export const APARTMENT_ROOMS: RoomKey[] = [
  "living",
  "dining",
  "kitchen",
  "bedroom",
  "kids",
  "guest",
  "office",
  "dressing",
  "bathroom",
  "entry",
  "cellar",
  "balcony",
  "safe",
];
export const HOUSE_ONLY_ROOMS: RoomKey[] = [
  "garage",
  "attic",
  "shed",
  "garden",
  "laundry",
];

// ---------------------------------------------------------------------------
// Tags — a vocabulary per user; an item gets a tag only when it is true of it
// ---------------------------------------------------------------------------
export type TagKey =
  | "work"
  | "gift"
  | "insured"
  | "fragile"
  | "highValue"
  | "kids"
  | "outdoor"
  | "travel"
  | "toSell"
  | "needsRepair"
  | "secondHand"
  | "sentimental"
  | "shared";

export const TAG_LABELS: Record<TagKey, L<string[]>> = {
  work: { fr: ["pro", "travail", "Boulot"], en: ["work", "Work"] },
  gift: { fr: ["cadeau", "Cadeau"], en: ["gift", "Gift"] },
  insured: { fr: ["assuré", "Assuré"], en: ["insured", "Insured"] },
  fragile: { fr: ["fragile", "Fragile"], en: ["fragile", "Fragile"] },
  highValue: {
    fr: ["valeur", "Objets de valeur"],
    en: ["valuable", "High value"],
  },
  kids: { fr: ["enfants", "Les petits"], en: ["kids", "Kids"] },
  outdoor: { fr: ["extérieur", "jardin"], en: ["outdoor", "Garden"] },
  travel: { fr: ["voyage", "Vacances"], en: ["travel", "Travel"] },
  toSell: { fr: ["à vendre", "À vendre"], en: ["to sell", "For sale"] },
  needsRepair: { fr: ["à réparer", "SAV"], en: ["needs repair", "Repair"] },
  secondHand: { fr: ["occasion", "Seconde main"], en: ["second-hand", "Used"] },
  sentimental: {
    fr: ["souvenir", "Valeur sentimentale"],
    en: ["sentimental", "Keepsake"],
  },
  shared: { fr: ["commun", "Partagé"], en: ["shared", "Family"] },
};

export const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

// ---------------------------------------------------------------------------
// Where things were bought
// ---------------------------------------------------------------------------
export interface Retailer {
  name: string;
  online: boolean;
  /** Order-reference shape, `#` = digit, `A` = letter. */
  ref?: string;
}

/**
 * Where someone lives decides where they shop, sell, insure and get things
 * repaired; the language they write in is separate (an English speaker in
 * Lyon buys at Fnac and sells on Le Bon Coin, but writes notes in English).
 */
export type Market = "fr" | "ch" | "uk";
type M<T> = Record<Market, T>;

const shop = (name: string): Retailer => ({ name, online: false });
const web = (name: string, ref: string): Retailer => ({
  name,
  online: true,
  ref,
});

const AMAZON_FR = web("Amazon", "40#-#######-#######");
const AMAZON_UK = web("Amazon", "20#-#######-#######");
const AMAZON_CH = web("Amazon", "30#-#######-#######");
const APPLE: Retailer[] = [shop("Apple Store"), web("apple.com", "W#########")];

export const RETAILERS: Record<Category, M<Retailer[]>> = {
  ELECTRONICS: {
    fr: [
      shop("Fnac"),
      web("Fnac.com", "##########"),
      shop("Darty"),
      shop("Boulanger"),
      AMAZON_FR,
      web("Cdiscount", "##########"),
      web("LDLC", "#######"),
      ...APPLE,
    ],
    ch: [
      shop("Fnac"),
      shop("Interdiscount"),
      web("Digitec", "#########"),
      web("Galaxus", "#########"),
      shop("MediaMarkt"),
      ...APPLE,
    ],
    uk: [
      shop("Currys"),
      shop("John Lewis"),
      AMAZON_UK,
      web("Argos", "AA#########"),
      ...APPLE,
    ],
  },
  APPLIANCE: {
    fr: [
      shop("Darty"),
      shop("Boulanger"),
      web("Boulanger.com", "##########"),
      AMAZON_FR,
      shop("Conforama"),
      shop("But"),
    ],
    ch: [
      shop("Fust"),
      web("Galaxus", "#########"),
      shop("MediaMarkt"),
      shop("Interdiscount"),
    ],
    uk: [
      shop("Currys"),
      shop("John Lewis"),
      web("AO.com", "AO########"),
      AMAZON_UK,
    ],
  },
  FURNITURE: {
    fr: [
      shop("IKEA"),
      shop("Maisons du Monde"),
      web("La Redoute", "#########"),
      shop("But"),
      shop("Conforama"),
    ],
    ch: [shop("IKEA"), shop("Pfister"), shop("Conforama"), shop("Micasa")],
    uk: [
      shop("IKEA"),
      shop("John Lewis"),
      shop("Habitat"),
      web("Made.com", "##########"),
    ],
  },
  TOOL: {
    fr: [
      shop("Leroy Merlin"),
      shop("Castorama"),
      shop("Brico Dépôt"),
      web("ManoMano", "M##########"),
      AMAZON_FR,
    ],
    ch: [
      shop("Jumbo"),
      shop("Hornbach"),
      shop("Bauhaus"),
      web("Galaxus", "#########"),
    ],
    uk: [
      shop("Screwfix"),
      shop("B&Q"),
      web("Toolstation", "#########"),
      AMAZON_UK,
    ],
  },
  VEHICLE: {
    fr: [
      shop("Decathlon"),
      shop("Culture Vélo"),
      shop("Cycles Arnaud"),
      web("Alltricks", "#########"),
    ],
    ch: [shop("Cycles Arnaud"), shop("Decathlon"), web("Galaxus", "#########")],
    uk: [
      shop("Halfords"),
      shop("Evans Cycles"),
      shop("Greenway Cycles"),
      web("Wiggle", "##########"),
    ],
  },
  CLOTHING: {
    fr: [
      shop("Galeries Lafayette"),
      shop("Printemps"),
      web("Zalando", "##########"),
      shop("Boutique {brand}"),
    ],
    ch: [
      shop("Manor"),
      shop("Globus"),
      web("Zalando", "##########"),
      shop("Boutique {brand}"),
    ],
    uk: [
      shop("Selfridges"),
      shop("John Lewis"),
      web("ASOS", "#########"),
      shop("{brand} store"),
    ],
  },
  JEWELRY: {
    fr: [
      shop("Bijouterie Lavergne"),
      shop("Boutique {brand}"),
      shop("Horlogerie Fontaine"),
    ],
    ch: [
      shop("Bucherer"),
      shop("Boutique {brand}"),
      shop("Horlogerie Fontaine"),
    ],
    uk: [
      shop("Goldsmiths"),
      shop("{brand} boutique"),
      shop("Hartley & Sons Jewellers"),
    ],
  },
  SPORTS: {
    fr: [
      shop("Decathlon"),
      web("decathlon.fr", "##########"),
      shop("Intersport"),
      shop("Go Sport"),
      web("Ekosport", "#######"),
    ],
    ch: [
      shop("Decathlon"),
      shop("Ochsner Sport"),
      shop("SportXX"),
      shop("Intersport"),
    ],
    uk: [shop("Decathlon"), shop("Sports Direct"), web("Wiggle", "##########")],
  },
  COLLECTIBLE: {
    fr: [
      shop("Fnac"),
      web("Woodbrass", "########"),
      shop("Le Comptoir Musical"),
      shop("Galerie Montclair"),
    ],
    ch: [shop("Fnac"), shop("Le Comptoir Musical"), shop("Galerie Montclair")],
    uk: [
      shop("Waterstones"),
      web("Andertons", "########"),
      shop("Soundhouse Music"),
      shop("Northgate Gallery"),
    ],
  },
  OTHER: {
    fr: [AMAZON_FR],
    ch: [AMAZON_CH, shop("Manor"), shop("Jumbo")],
    uk: [AMAZON_UK, shop("John Lewis"), shop("Mamas & Papas")],
  },
};

/** Where a specific item can actually be bought, when its category's shop
 *  list would lie (own-brand and design pieces, direct-sale products). */
const DECATHLON: M<Retailer[]> = {
  fr: [shop("Decathlon"), web("decathlon.fr", "##########")],
  ch: [shop("Decathlon"), web("decathlon.ch", "##########")],
  uk: [shop("Decathlon"), web("decathlon.co.uk", "##########")],
};
const IKEA: M<Retailer[]> = {
  fr: [shop("IKEA"), web("ikea.com", "#########")],
  ch: [shop("IKEA"), web("ikea.com", "#########")],
  uk: [shop("IKEA"), web("ikea.com", "#########")],
};
const DESIGN: M<Retailer[]> = {
  fr: [
    shop("Silvera"),
    shop("The Conran Shop"),
    web("Made in Design", "#######"),
  ],
  ch: [shop("Teo Jakob"), shop("Pfister"), web("Made in Design", "#######")],
  uk: [
    shop("The Conran Shop"),
    shop("Heal's"),
    web("Utility Design", "#######"),
  ],
};
const BIKE: M<Retailer[]> = {
  fr: [
    shop("Culture Vélo"),
    shop("Cycles Arnaud"),
    web("Alltricks", "#########"),
  ],
  ch: [shop("Cycles Arnaud")],
  uk: [shop("Evans Cycles"), shop("Greenway Cycles")],
};
const one = (
  fr: Retailer[],
  ch: Retailer[],
  uk: Retailer[]
): M<Retailer[]> => ({ fr, ch, uk });

export const SHOP_OVERRIDES: Record<string, M<Retailer[]>> = {
  rockrider: DECATHLON,
  "kids-bike": DECATHLON,
  "quechua-tent": DECATHLON,
  kayak: DECATHLON,
  treadmill: DECATHLON,
  trampoline: DECATHLON,
  malm: IKEA,
  pax: IKEA,
  kallax: IKEA,
  "bunk-bed": IKEA,
  sofa: one(
    [shop("Maisons du Monde"), web("maisonsdumonde.com", "##########")],
    [shop("Maisons du Monde")],
    [shop("Maisons du Monde")]
  ),
  "dining-table": one(
    [web("La Redoute", "#########")],
    [web("La Redoute", "#########")],
    [web("La Redoute", "#########")]
  ),
  eames: DESIGN,
  aeron: DESIGN,
  "dining-chairs": DESIGN,
  "emma-mattress": one(
    [web("emma-matelas.fr", "FR#########")],
    [web("emma-matratze.ch", "CH#########")],
    [web("emma-mattress.co.uk", "GB#########")]
  ),
  "standing-desk": one(
    [web("flexispot.fr", "########"), AMAZON_FR],
    [web("Galaxus", "#########")],
    [web("flexispot.co.uk", "########"), AMAZON_UK]
  ),
  thermomix: one(
    [web("Vorwerk", "VK########")],
    [web("Vorwerk", "VK########")],
    [web("Vorwerk", "VK########")]
  ),
  peloton: one(
    [web("onepeloton.fr", "##########")],
    [web("onepeloton.ch", "##########")],
    [web("onepeloton.co.uk", "##########")]
  ),
  concept2: one(
    [web("concept2.fr", "#######")],
    [web("concept2.ch", "#######")],
    [web("concept2.co.uk", "#######")]
  ),
  zoe: one(
    [shop("Garage Moreau (agent Renault)")],
    [shop("Garage du Lac (agent Renault)")],
    [shop("Hilltop Motors (Renault)")]
  ),
  vespa: one(
    [shop("Scooters Lebrun")],
    [shop("Scooters Lebrun")],
    [shop("Vespa Centre Kingston")]
  ),
  vado: BIKE,
  moustache: BIKE,
  brompton: BIKE,
  domane: BIKE,
  "trek-marlin": BIKE,
  cargo: BIKE,
  neverfull: one(
    [shop("Louis Vuitton")],
    [shop("Louis Vuitton")],
    [shop("Louis Vuitton")]
  ),
  moncler: one(
    [shop("Moncler"), shop("Galeries Lafayette")],
    [shop("Moncler"), shop("Globus")],
    [shop("Moncler"), shop("Selfridges")]
  ),
  "wedding-dress": one(
    [shop("Les Mariées de Clara")],
    [shop("Les Mariées de Clara")],
    [shop("White Lace Bridal")]
  ),
  "upright-piano": one(
    [shop("Maison du Piano Girard")],
    [shop("Maison du Piano Girard")],
    [shop("Bellamy Pianos")]
  ),
  painting: one(
    [shop("Galerie Montclair"), shop("Atelier Lucie Garnier")],
    [shop("Galerie Montclair")],
    [shop("Northgate Gallery"), shop("Riverside Open Studios")]
  ),
  "bd-collection": one(
    [shop("Fnac"), shop("Librairie Bulles & Cases")],
    [shop("Fnac"), shop("Payot")],
    [shop("Waterstones")]
  ),
  "engagement-ring": one(
    [shop("Mauboussin")],
    [shop("Bucherer")],
    [shop("Hartley & Sons Jewellers")]
  ),
  "wedding-bands": one(
    [shop("Bijouterie Lavergne")],
    [shop("Bijouterie Favre")],
    [shop("Hartley & Sons Jewellers")]
  ),
  // "Collectibles" mixes instruments, a pen, a camera and a toy: each is
  // sold where that kind of thing is sold.
  "lego-falcon": one(
    [
      shop("Fnac"),
      shop("LEGO Store"),
      web("lego.com", "T#########"),
      AMAZON_FR,
    ],
    [shop("Franz Carl Weber"), web("lego.com", "T#########")],
    [shop("LEGO Store"), web("lego.com", "T#########")]
  ),
  strat: one(
    [
      web("Woodbrass", "########"),
      shop("Le Comptoir Musical"),
      web("Thomann", "#########"),
    ],
    [shop("Le Comptoir Musical"), web("Thomann", "#########")],
    [web("Andertons", "########"), shop("Soundhouse Music")]
  ),
  taylor: one(
    [
      web("Woodbrass", "########"),
      shop("Le Comptoir Musical"),
      web("Thomann", "#########"),
    ],
    [shop("Le Comptoir Musical"), web("Thomann", "#########")],
    [web("Andertons", "########"), shop("Soundhouse Music")]
  ),
  "yamaha-p125": one(
    [
      web("Woodbrass", "########"),
      shop("Le Comptoir Musical"),
      web("Thomann", "#########"),
    ],
    [shop("Le Comptoir Musical"), web("Thomann", "#########")],
    [web("Andertons", "########"), shop("Soundhouse Music")]
  ),
  montblanc: one(
    [shop("Boutique Montblanc"), shop("Galeries Lafayette"), shop("Printemps")],
    [shop("Boutique Montblanc"), shop("Globus")],
    [shop("Montblanc boutique"), shop("Selfridges")]
  ),
  "leica-m6": one(
    [shop("Leica Store Paris")],
    [shop("Leica Store Zürich")],
    [shop("Leica Store London")]
  ),
  turntable: one(
    [shop("Fnac"), web("Son-Vidéo.com", "#######")],
    [shop("Fnac"), web("Galaxus", "#########")],
    [shop("Richer Sounds"), web("Sevenoaks", "#######")]
  ),
  suitcase: one(
    [shop("Galeries Lafayette"), shop("Boutique {brand}"), AMAZON_FR],
    [shop("Globus"), shop("Boutique {brand}")],
    [shop("John Lewis"), AMAZON_UK]
  ),
  anker: one(
    [AMAZON_FR, shop("Fnac"), shop("Boulanger")],
    [AMAZON_CH, web("Galaxus", "#########")],
    [AMAZON_UK, shop("Currys")]
  ),
  weber: one(
    [shop("Leroy Merlin"), shop("Castorama"), shop("Boulanger"), AMAZON_FR],
    [shop("Jumbo"), shop("Hornbach")],
    [shop("B&Q"), AMAZON_UK]
  ),
  babyzen: one(
    [shop("Aubert"), shop("Galeries Lafayette"), AMAZON_FR],
    [shop("Manor"), shop("Baby-Rose")],
    [shop("Mamas & Papas"), shop("John Lewis")]
  ),
  "car-seat": one(
    [shop("Aubert"), AMAZON_FR],
    [shop("Manor"), AMAZON_CH],
    [shop("Mamas & Papas"), AMAZON_UK]
  ),
  "pool-robot": one(
    [shop("Leroy Merlin"), shop("Castorama"), AMAZON_FR],
    [shop("Jumbo"), shop("Hornbach")],
    [shop("B&Q"), AMAZON_UK]
  ),
  surfboard: one(
    [shop("Surf Shop Côte Basque"), web("Glisshop", "#########")],
    [web("Glisshop", "#########")],
    [shop("Fistral Beach Surf Shop")]
  ),
  snowboard: one(
    [
      web("Glisshop", "#########"),
      web("Ekosport", "#######"),
      shop("Intersport"),
    ],
    [shop("Ochsner Sport"), web("Glisshop", "#########")],
    [shop("Snow+Rock")]
  ),
  golf: one(
    [shop("Golf Plus"), shop("Decathlon"), shop("Go Sport")],
    [shop("Golf Plus"), shop("Decathlon")],
    [shop("American Golf")]
  ),
};

export interface SecondHandSource {
  name: string;
  /** Bought from someone the owner knows, not a platform. */
  person?: boolean;
  /** Only plausible for these categories. */
  categories?: Category[];
}

/** Platforms by market; people (colleague, friend) by the owner's language. */
export const SECOND_HAND_PLATFORMS: M<SecondHandSource[]> = {
  fr: [
    { name: "Le Bon Coin" },
    { name: "Le Bon Coin" },
    { name: "Vinted", categories: ["CLOTHING", "OTHER"] },
    {
      name: "Vide-grenier",
      categories: ["COLLECTIBLE", "SPORTS", "TOOL", "OTHER"],
    },
  ],
  ch: [
    { name: "Ricardo" },
    { name: "Anibis" },
    { name: "Vinted", categories: ["CLOTHING"] },
  ],
  uk: [
    { name: "eBay" },
    { name: "Facebook Marketplace" },
    { name: "Gumtree" },
    { name: "Vinted", categories: ["CLOTHING"] },
  ],
};

export const SECOND_HAND_PEOPLE: L<SecondHandSource[]> = {
  fr: [
    { name: "Un collègue", person: true },
    { name: "Mon beau-frère", person: true },
  ],
  en: [
    { name: "A colleague", person: true },
    { name: "A friend", person: true },
  ],
};

export const REFURBISHED: M<string> = {
  fr: "Back Market",
  ch: "Back Market",
  uk: "Back Market",
};

// ---------------------------------------------------------------------------
// Free text on the article itself — sparse, specific, in the user's voice
// ---------------------------------------------------------------------------
/** A line of free text and, optionally, the catalogue keys or `noun.en`
 *  kinds it is true of; without `for`, it fits anything in the category. */
export interface Desc {
  fr: string;
  en: string;
  for?: string[];
  /** Catalogue keys the line is untrue of, though `for` matches them. */
  notFor?: string[];
}

const PHONE_LIKE = ["Phone", "Tablet", "E-reader"];
const BATTERY = [
  "Phone",
  "Tablet",
  "Laptop",
  "MacBook",
  "Smartwatch",
  "Earbuds",
  "Headphones",
  "Bluetooth speaker",
  "E-reader",
  "Action camera",
  "Drone",
  "Console",
  "GPS watch",
];

export const DESCRIPTIONS: Record<Category, Desc[]> = {
  ELECTRONICS: [
    {
      fr: "Coque et verre trempé depuis le premier jour.",
      en: "Case and screen protector on from day one.",
      for: PHONE_LIKE,
    },
    {
      fr: "Utilisé{e} pour le télétravail.",
      en: "Used for working from home.",
      for: ["Laptop", "MacBook", "Monitor", "Headphones", "Printer"],
    },
    {
      fr: "Boîte d'origine gardée au grenier.",
      en: "Original box is in the loft.",
    },
    {
      fr: "{Remplace|Remplacent} {l'ancien/l'ancienne/les anciens/les anciennes} qui ne {tenait|tenaient} plus la charge.",
      en: "Replaced the old one, battery was dead.",
      for: BATTERY,
      notFor: ["ps5", "ps5pro"], // mains-powered consoles
    },
    {
      fr: "Configuré{e} avec le compte familial.",
      en: "Set up on the family account.",
      for: [
        "Phone",
        "Tablet",
        "Console",
        "Speaker",
        "Soundbar",
        "TV",
        "E-reader",
      ],
    },
    {
      fr: "Chargeur d'origine dans le tiroir du bureau.",
      en: "Original charger is in the desk drawer.",
      for: BATTERY,
      notFor: ["ps5", "ps5pro"],
    },
    {
      fr: "Petite rayure sur le côté, rien de grave.",
      en: "Small scuff on one side, works fine.",
    },
    {
      fr: "Fixé{e} au mur, support acheté à part.",
      en: "Wall-mounted, bracket bought separately.",
      for: ["TV"],
    },
    {
      fr: "Toujours rangé{e} dans {sa|leur} housse.",
      en: "Always kept in its case.",
      for: ["Camera", "Lens", "Drone", "Headphones", "Action camera"],
    },
  ],
  APPLIANCE: [
    {
      fr: "Installé{e} par le magasin, ils ont repris {l'ancien/l'ancienne/les anciens/les anciennes}.",
      en: "Installed by the shop, they took the old one away.",
      for: [
        "Dishwasher",
        "Fridge",
        "Washing machine",
        "Tumble dryer",
        "Oven",
        "Induction hob",
        "Air conditioner",
      ],
    },
    {
      fr: "Détartrer tous les 3 mois.",
      en: "Descale every 3 months.",
      for: ["Coffee machine", "Bean-to-cup coffee machine", "Kettle"],
    },
    {
      fr: "Notice rangée dans le classeur électroménager.",
      en: "Manual is in the appliance folder.",
    },
    {
      fr: "{Remplace|Remplacent} {l'ancien/l'ancienne/les anciens/les anciennes}, tombé{e} en panne juste après la garantie...",
      en: "Replaced the old one, which died just out of warranty.",
    },
    { fr: "{Pris/Prise/Pris/Prises} en promo, -20 %.", en: "Got it 20% off." },
    {
      fr: "Filtre à changer tous les ans.",
      en: "Filter needs replacing every year.",
      for: ["Air purifier", "Vacuum", "Robot vacuum"],
    },
  ],
  FURNITURE: [
    {
      fr: "Monté{e} nous-mêmes, la notice est dans le tiroir.",
      en: "Assembled it ourselves, instructions in the drawer.",
      for: ["malm", "pax", "kallax", "bunk-bed", "standing-desk"],
    },
    {
      fr: "Housse déhoussable, lavable à 30°.",
      en: "Removable cover, washable at 30°.",
      for: ["sofa"],
    },
    { fr: "Livraison en 6 semaines...", en: "Took six weeks to arrive." },
    {
      fr: "Vis de rechange dans un sachet scotché dessous.",
      en: "Spare screws taped underneath.",
      for: [
        "malm",
        "pax",
        "kallax",
        "bunk-bed",
        "dining-table",
        "standing-desk",
      ],
    },
    {
      fr: "Garantie 10 ans, garder la facture.",
      en: "10-year guarantee, keep the receipt.",
      for: ["pax", "emma-mattress"],
    },
  ],
  TOOL: [
    {
      fr: "Batteries partagées avec la visseuse.",
      en: "Shares batteries with the drill.",
      for: [
        "dewalt-saw",
        "makita-impact",
        "hedge-trimmer",
        "mower",
        "chainsaw",
      ],
    },
    {
      fr: "Livré{e} avec 2 batteries 5 Ah et le chargeur.",
      en: "Came with two 5Ah batteries and the charger.",
      for: ["bosch-drill", "makita-impact", "dewalt-saw"],
    },
    {
      fr: "Rangé{e} dans la mallette d'origine.",
      en: "Kept in the original case.",
      for: [
        "bosch-drill",
        "makita-impact",
        "sander",
        "laser-level",
        "festool-ts55",
      ],
    },
    {
      fr: "Remisé{e} l'hiver dans l'abri.",
      en: "Stored in the shed over winter.",
      for: ["mower", "hedge-trimmer", "chainsaw", "karcher-k5"],
    },
    {
      fr: "Lames de rechange dans le tiroir de l'établi.",
      en: "Spare blades in the workbench drawer.",
      for: ["dewalt-saw", "festool-ts55", "hedge-trimmer"],
    },
  ],
  VEHICLE: [
    {
      fr: "Antivol en U acheté en même temps.",
      en: "D-lock bought at the same time.",
      for: [
        "Mountain bike",
        "E-bike",
        "Folding bike",
        "Road bike",
        "Cargo bike",
        "E-scooter",
      ],
    },
    {
      fr: "Gravé{e} Bicycode.",
      en: "Frame is security-marked.",
      for: [
        "Mountain bike",
        "E-bike",
        "Folding bike",
        "Road bike",
        "Cargo bike",
      ],
    },
    {
      fr: "Révision annuelle chez le vélociste.",
      en: "Serviced every spring at the bike shop.",
      for: [
        "Mountain bike",
        "E-bike",
        "Folding bike",
        "Road bike",
        "Cargo bike",
      ],
    },
    {
      fr: "Prime vélo électrique de la ville obtenue.",
      en: "Got the council's e-bike grant.",
      for: ["E-bike", "Cargo bike"],
    },
    {
      fr: "Double des clés dans le tiroir de l'entrée.",
      en: "Spare key in the hallway drawer.",
      for: ["Scooter", "Car"],
    },
    { fr: "Casque acheté en même temps.", en: "Bought a helmet with it." },
  ],
  CLOTHING: [
    { fr: "Taille un peu grand.", en: "Runs a bit large." },
    {
      fr: "Nettoyage à sec uniquement.",
      en: "Dry clean only.",
      for: ["suit", "wedding-dress", "goose-parka", "moncler"],
    },
    {
      fr: "Acheté{e} pour le ski.",
      en: "Bought for the ski trip.",
      for: ["ski-jacket", "goose-parka", "moncler", "nano-puff"],
    },
    {
      fr: "Porté{e} au mariage de Julie.",
      en: "Wore it to Sam's wedding.",
      for: ["suit"],
    },
    {
      fr: "À ré-imperméabiliser chaque hiver.",
      en: "Re-wax every winter.",
      for: ["barbour"],
    },
    {
      fr: "Ticket gardé pour un éventuel échange.",
      en: "Kept the receipt in case it needs exchanging.",
    },
  ],
  JEWELRY: [
    {
      fr: "Certificat d'authenticité dans le coffre.",
      en: "Certificate of authenticity in the safe.",
    },
    {
      fr: "Boîte et papiers conservés.",
      en: "Box and papers kept.",
      for: ["Watch"],
    },
    {
      fr: "Bracelet raccourci de 2 maillons.",
      en: "Bracelet shortened by two links.",
      for: ["submariner", "speedmaster", "carrera"],
    },
    {
      fr: "Facture et certificat scannés.",
      en: "Receipt and certificate scanned.",
    },
    {
      fr: "Mise à taille par le bijoutier.",
      en: "Resized by the jeweller.",
      for: ["engagement-ring", "wedding-bands"],
    },
  ],
  SPORTS: [
    {
      fr: "Farté{e} en début de saison.",
      en: "Waxed at the start of the season.",
      for: ["skis", "snowboard"],
    },
    {
      fr: "Utilisé{e} 2 fois par semaine.",
      en: "Used twice a week.",
      for: ["peloton", "concept2", "treadmill", "racket"],
    },
    {
      fr: "Housse de transport incluse.",
      en: "Came with a carry bag.",
      for: ["skis", "snowboard", "golf", "racket", "surfboard"],
    },
    {
      fr: "Acheté{e} après avoir loué deux saisons.",
      en: "Bought after renting for two seasons.",
      for: ["skis", "ski-boots", "snowboard"],
    },
    {
      fr: "Toujours utilisé{e} en camping l'été.",
      en: "Goes camping with us every summer.",
      for: ["quechua-tent", "kayak"],
    },
  ],
  COLLECTIBLE: [
    {
      fr: "Boîte d'origine conservée.",
      en: "Kept the original box.",
      for: ["lego-falcon", "leica-m6", "montblanc", "turntable"],
    },
    {
      fr: "Accordé{e} une fois par an.",
      en: "Tuned once a year.",
      for: ["upright-piano"],
    },
    {
      fr: "Encadré{e} chez l'encadreur du quartier.",
      en: "Framed at the local framer's.",
      for: ["painting"],
    },
    {
      fr: "Monté{e} avec les enfants pendant les vacances.",
      en: "Built it with the kids over the holidays.",
      for: ["lego-falcon"],
    },
    {
      fr: "Cordes changées tous les 3 mois.",
      en: "Restrung every three months.",
      for: ["strat", "taylor"],
    },
  ],
  OTHER: [
    {
      fr: "Housse de protection achetée en plus.",
      en: "Bought a cover for it as well.",
      for: ["weber", "garden-set", "trampoline"],
    },
    {
      fr: "Prêté{e} souvent, penser à {le/la/les/les} récupérer.",
      en: "Gets borrowed a lot, remember to get it back.",
      for: ["anker", "suitcase", "babyzen"],
    },
    {
      fr: "Pour les vacances.",
      en: "For holidays.",
      for: ["suitcase", "anker"],
    },
    { fr: "Homologué{e} i-Size.", en: "i-Size approved.", for: ["car-seat"] },
  ],
};

export const GIFT_DESCRIPTIONS: L<string[]> = {
  fr: [
    "Cadeau de mes parents pour mon anniversaire.",
    "Offert{e} pour Noël.",
    "Cadeau de mariage.",
    "Offert{e} par les collègues pour mon départ.",
    "Cadeau de ma sœur.",
  ],
  en: [
    "Birthday present from my parents.",
    "Christmas present.",
    "Wedding present.",
    "Leaving present from work.",
    "Present from my sister.",
  ],
};

export const SECOND_HAND_DESCRIPTIONS: L<{
  platform: ((source: string) => string)[];
  person: string[];
}> = {
  fr: {
    platform: [
      (src) => `Acheté{e} d'occasion sur ${src}, très bon état.`,
      () => "Occasion, le vendeur m'a donné la facture d'origine.",
      () => "Occasion, quelques traces d'usage.",
    ],
    person: [
      "Racheté{e} à un collègue.",
      "Récupéré{e} auprès de mon beau-frère.",
      "Racheté{e} à un ami qui changeait de modèle.",
    ],
  },
  en: {
    platform: [
      (src) => `Bought second-hand on ${src}, very good condition.`,
      () => "Used, the seller passed on the original receipt.",
      () => "Second-hand, a few marks.",
    ],
    person: [
      "Bought off a colleague.",
      "Took it off a friend's hands.",
      "Bought from a friend who upgraded.",
    ],
  },
};

/** Casual users put purchase facts in the description instead of the fields. */
export const CASUAL_PURCHASE_NOTE: L<
  (retailer: string, online: boolean, months: number) => string
> = {
  fr: (r, online, m) =>
    `Acheté{e} ${online ? "sur" : "chez"} ${r}, garantie ${m >= 12 && m % 12 === 0 ? `${m / 12} an${m >= 24 ? "s" : ""}` : `${m} mois`}.`,
  en: (r, online, m) =>
    `Bought ${online ? "from" : "at"} ${r}, ${m >= 12 && m % 12 === 0 ? `${m / 12}-year` : `${m}-month`} warranty.`,
};

export const SOLD_NOTES: L<((price: string) => string)[]> = {
  fr: [
    (p) => `Vendu{e} sur Le Bon Coin ${p}.`,
    (p) => `Revendu{e} ${p} à un collègue.`,
    (p) =>
      `{Repris/Reprise/Repris/Reprises} ${p} par le magasin pour l'achat {du nouveau/de la nouvelle/des nouveaux/des nouvelles}.`,
  ],
  en: [
    (p) => `Sold on eBay for ${p}.`,
    (p) => `Sold to a friend for ${p}.`,
    (p) => `Traded in for ${p} against the new one.`,
  ],
};

export const DISPOSED_NOTES: L<string[]> = {
  fr: [
    "Tombé{e} en panne, déposé{e} à la déchetterie.",
    "Plus {réparable|réparables}, recyclé{e} en magasin.",
    "Donné{e} à Emmaüs.",
  ],
  en: [
    "Broke down, taken to the tip.",
    "Not worth repairing, recycled at the shop.",
    "Donated to a charity shop.",
  ],
};

/** What a finder types on a lost item's QR page (contact, message). */
export const FOUND_REPORTS: L<{ contact: string; message: string }[]> = {
  fr: [
    {
      contact: "marc.duval@example.com",
      message:
        "Bonjour, je {l'ai trouvé/l'ai trouvée/les ai trouvés/les ai trouvées} sur un banc près de la gare. Je {le/la/les/les} garde chez moi, écrivez-moi pour {le/la/les/les} récupérer.",
    },
    {
      contact: "nadia.k@example.com",
      message:
        "Trouvé{e} dans le tram ce matin, j'ai scanné l'étiquette. Je peux {le/la/les/les} déposer où vous voulez dans la semaine.",
    },
  ],
  en: [
    {
      contact: "mark.d@example.com",
      message:
        "Hi, found this on a bench by the station. I'm keeping it safe, email me to collect it.",
    },
  ],
};

export const LOST_NOTES: L<string[]> = {
  fr: [
    "Perdu{e} dans le train, déclaration faite.",
    "Oublié{e} à l'hôtel, jamais retrouvé{e}.",
    "Probablement volé{e} au bureau.",
  ],
  en: [
    "Lost on the train, reported it.",
    "Left it at a hotel, never found.",
    "Probably stolen at work.",
  ],
};

// ---------------------------------------------------------------------------
// Article journal (ArticleNote)
// ---------------------------------------------------------------------------
export const NOTE_TEXTS: Record<
  "SERVICE" | "WARRANTY_CLAIM" | "MAINTENANCE" | "OTHER",
  L<string[]>
> = {
  SERVICE: {
    fr: [
      "Déposé{e} au SAV, ticket n°{n}.",
      "Le technicien passe jeudi matin.",
      "Réparation acceptée, retour sous 10 jours.",
      "Récupéré{e}, {fonctionne|fonctionnent} à nouveau.",
    ],
    en: [
      "Dropped at the service centre, ticket #{n}.",
      "Engineer coming Thursday morning.",
      "Repair approved, back in 10 days.",
      "Collected, working again.",
    ],
  },
  WARRANTY_CLAIM: {
    fr: [
      "Appelé le SAV : pris en charge sous garantie.",
      "Envoyé la facture et des photos au fabricant.",
      "Dossier n°{n} ouvert.",
      "Échange standard accepté.",
    ],
    en: [
      "Called support: covered under warranty.",
      "Sent the receipt and photos to the manufacturer.",
      "Case #{n} opened.",
      "Like-for-like replacement approved.",
    ],
  },
  MAINTENANCE: {
    fr: [
      "Nettoyé le filtre.",
      "Pneus regonflés, chaîne graissée.",
      "Détartrage fait.",
      "Mise à jour du firmware.",
      "Remplacé les piles.",
    ],
    en: [
      "Cleaned the filter.",
      "Pumped the tyres, oiled the chain.",
      "Descaled.",
      "Firmware updated.",
      "Replaced the batteries.",
    ],
  },
  OTHER: {
    fr: [
      "Photo du numéro de série prise.",
      "Ajouté{e} à l'assurance habitation.",
      "Prêté{e} à Julien pour le week-end.",
      "Penser à racheter un câble.",
    ],
    en: [
      "Took a photo of the serial number.",
      "Added to the home insurance.",
      "Lent to Tom for the weekend.",
      "Need to buy a spare cable.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Warranties
// ---------------------------------------------------------------------------
/** `legal` is the two-year legal guarantee of conformity, which the SELLER
 *  owes (Code de la consommation, art. L217-3 et seq.); `maker` is a
 *  manufacturer's own warranty, for its own length. */
export const WARRANTY_NAMES: L<{
  legal: string;
  maker: (brand: string, months: number) => string;
  extended: (retailer: string, months: number) => string;
  brand: Record<string, string>;
}> = {
  fr: {
    legal: "Garantie légale 2 ans",
    maker: (b, m) =>
      m === 24
        ? pick([`Garantie ${b}`, `Garantie constructeur ${b}`])
        : m === 12
          ? pick([`Garantie ${b}`, `Garantie constructeur ${b} 1 an`])
          : `Garantie ${b} ${m >= 12 && m % 12 === 0 ? `${m / 12} ans` : `${m} mois`}`,
    extended: (r, m) => `Extension de garantie ${r} ${m / 12} ans`,
    brand: { Apple: "AppleCare+", Samsung: "Samsung Care+" },
  },
  en: {
    legal: "Statutory 2-year guarantee",
    maker: (b, m) =>
      m === 24
        ? pick([`${b} warranty`, `${b} guarantee`])
        : `${b} ${m >= 12 && m % 12 === 0 ? `${m / 12}-year` : `${m}-month`} warranty`,
    extended: (r, m) => `${r} ${m / 12}-year extended warranty`,
    brand: { Apple: "AppleCare+", Samsung: "Samsung Care+" },
  },
};

/** The maker's own site, at its root: a deep support path can move, a
 *  domain doesn't. Phone numbers are deliberately not seeded. */
export const SUPPORT_URLS: Record<string, string> = {
  Apple: "https://www.apple.com/fr/",
  Samsung: "https://www.samsung.com/fr/",
  Bosch: "https://www.bosch-home.fr/",
  "Bosch Professional": "https://www.bosch-professional.com/fr/fr/",
  Dyson: "https://www.dyson.fr/",
  LG: "https://www.lg.com/fr/",
  Sony: "https://www.sony.fr/",
  Miele: "https://www.miele.fr/",
  Rolex: "https://www.rolex.com/",
  Omega: "https://www.omegawatches.com/",
  Makita: "https://www.makita.fr/",
  Canon: "https://www.canon.fr/",
  Google: "https://store.google.com/",
  Nintendo: "https://www.nintendo.com/",
  Kärcher: "https://www.kaercher.com/",
};

export const CLAIM_NOTES: L<{ open: string[]; resolved: string[] }> = {
  fr: {
    open: [
      "Écran qui scintille, envoyé{e} au SAV.",
      "Ne charge plus, dossier ouvert chez le fabricant.",
      "Bruit anormal à l'essorage, technicien prévu.",
      "Batterie qui gonfle, en attente de retour du SAV.",
    ],
    resolved: [
      "Carte mère remplacée sous garantie.",
      "Échangé{e} contre {un neuf/une neuve/des neufs/des neuves} en magasin.",
      "Pompe de vidange changée, rien à payer.",
      "Réparé{e} sous garantie en 8 jours.",
    ],
  },
  en: {
    open: [
      "Screen flickering, sent for repair.",
      "Stopped charging, case open with the manufacturer.",
      "Grinding noise on spin, engineer booked.",
      "Battery swelling, waiting on the service centre.",
    ],
    resolved: [
      "Logic board replaced under warranty.",
      "Swapped for a new one in store.",
      "Drain pump replaced, nothing to pay.",
      "Fixed under warranty in 8 days.",
    ],
  },
};

export const RENEWAL_NOTES: L<{
  RENEWED: string;
  EXTENDED: string;
  REPLACED: string;
}> = {
  fr: {
    RENEWED: "Nouveau contrat souscrit.",
    EXTENDED: "Extension achetée avant l'échéance.",
    REPLACED: "Appareil remplacé, nouvelle garantie.",
  },
  en: {
    RENEWED: "Took out a new plan.",
    EXTENDED: "Bought the extension before it ran out.",
    REPLACED: "Unit replaced, warranty restarted.",
  },
};

// ---------------------------------------------------------------------------
// Servicing
// ---------------------------------------------------------------------------
export interface ServiceSpec {
  text: L<string>;
  cost: [number, number] | null;
  months?: number;
}

export const SERVICES: Partial<Record<Category, ServiceSpec[]>> = {
  APPLIANCE: [
    {
      text: {
        fr: "Remplacement de la pompe de vidange",
        en: "Drain pump replaced",
      },
      cost: [90, 160],
    },
    {
      text: { fr: "Changement du joint de porte", en: "Door seal replaced" },
      cost: [45, 85],
    },
    {
      text: { fr: "Détartrage complet", en: "Full descale" },
      cost: null,
      months: 3,
    },
    {
      text: {
        fr: "Nettoyage du filtre et des bras de lavage",
        en: "Filter and spray arms cleaned",
      },
      cost: null,
      months: 1,
    },
  ],
  VEHICLE: [
    {
      text: { fr: "Révision annuelle", en: "Annual service" },
      cost: [60, 120],
      months: 12,
    },
    {
      text: { fr: "Plaquettes de frein changées", en: "Brake pads replaced" },
      cost: [25, 55],
    },
    {
      text: {
        fr: "Chaîne et cassette remplacées",
        en: "Chain and cassette replaced",
      },
      cost: [80, 150],
    },
    {
      text: { fr: "Réglage du dérailleur", en: "Gears indexed" },
      cost: [15, 30],
    },
    {
      text: { fr: "Pneu arrière remplacé", en: "Rear tyre replaced" },
      cost: [35, 60],
    },
  ],
  TOOL: [
    {
      text: { fr: "Affûtage de la chaîne", en: "Chain sharpened" },
      cost: [15, 30],
    },
    {
      text: { fr: "Charbons remplacés", en: "Carbon brushes replaced" },
      cost: [20, 40],
    },
    {
      text: { fr: "Hivernage et vidange", en: "Winter service and oil change" },
      cost: [55, 90],
      months: 12,
    },
  ],
  JEWELRY: [
    {
      text: {
        fr: "Révision complète du mouvement",
        en: "Full movement service",
      },
      cost: [380, 750],
      months: 60,
    },
    {
      text: { fr: "Contrôle d'étanchéité", en: "Water-resistance test" },
      cost: [30, 60],
      months: 24,
    },
    {
      text: {
        fr: "Polissage du boîtier et du bracelet",
        en: "Case and bracelet polished",
      },
      cost: [90, 180],
    },
  ],
  ELECTRONICS: [
    {
      text: { fr: "Remplacement de la batterie", en: "Battery replaced" },
      cost: [79, 119],
    },
    {
      text: { fr: "Remplacement de l'écran", en: "Screen replaced" },
      cost: [149, 349],
    },
    {
      text: { fr: "Nettoyage du capteur", en: "Sensor cleaned" },
      cost: [49, 89],
    },
  ],
  SPORTS: [
    {
      text: { fr: "Fartage et affûtage des carres", en: "Wax and edge tune" },
      cost: [25, 40],
      months: 12,
    },
    {
      text: { fr: "Entretien et graissage", en: "Service and lubrication" },
      cost: [60, 120],
      months: 12,
    },
  ],
  COLLECTIBLE: [
    { text: { fr: "Accordage", en: "Tuning" }, cost: [80, 120], months: 12 },
    {
      text: {
        fr: "Réglage complet et cordes neuves",
        en: "Full setup and new strings",
      },
      cost: [50, 80],
      months: 12,
    },
  ],
};

export const SERVICE_PROVIDERS: Partial<Record<Category, M<string[]>>> = {
  APPLIANCE: {
    fr: ["Électro Service Dépannage", "SAV du magasin", "Technicien agréé"],
    ch: ["Fust Service", "Technicien agréé"],
    uk: [
      "Appliance Repair Co.",
      "The shop's service team",
      "Approved engineer",
    ],
  },
  VEHICLE: {
    fr: ["Atelier Vélo du Centre", "Cycles Lebrun", "Decathlon atelier"],
    ch: ["Atelier vélo du quartier", "Decathlon atelier"],
    uk: ["The Bike Workshop", "Halfords", "Local bike shop"],
  },
  TOOL: {
    fr: ["Motoculture Girard", "Station technique agréée"],
    ch: ["Service technique Jumbo", "Station technique agréée"],
    uk: ["Garden Machinery Services", "Approved service centre"],
  },
  JEWELRY: {
    fr: ["Horlogerie Fontaine", "Boutique de la marque", "Horloger agréé"],
    ch: ["Bucherer", "Horloger agréé"],
    uk: [
      "Brand service centre",
      "Hatton & Sons Watchmakers",
      "Authorised dealer",
    ],
  },
  ELECTRONICS: {
    fr: ["Apple Store", "Réparateur agréé", "Save"],
    ch: ["Apple Store", "Réparateur agréé"],
    uk: ["Apple Store", "Approved repairer", "iSmash"],
  },
  SPORTS: {
    fr: ["Magasin de ski de la station", "Decathlon atelier"],
    ch: ["Magasin de ski de la station", "Ochsner Sport"],
    uk: ["Resort ski shop", "Decathlon workshop"],
  },
  COLLECTIBLE: {
    fr: ["Accordeur — M. Girard", "Luthier Delacroix"],
    ch: ["Accordeur — M. Favre", "Luthier"],
    uk: ["Piano tuner — Mr Reid", "Guitar tech"],
  },
};

// ---------------------------------------------------------------------------
// Lending
// ---------------------------------------------------------------------------
export const BORROWERS: L<string[]> = {
  fr: [
    "Julien, le voisin",
    "Maman",
    "Papa",
    "Camille R.",
    "Thomas",
    "Ma belle-sœur",
    "Karim du 3e",
    "Les Lefebvre",
    "Mon frère",
    "Élodie du boulot",
  ],
  en: [
    "Mum",
    "Dad",
    "Tom next door",
    "Sarah K.",
    "My brother",
    "Priya from work",
    "The Hughes",
    "Jack",
  ],
};

export const LOAN_RETURN_NOTES: L<string[]> = {
  fr: [
    "Rendu{e} en bon état.",
    "Rendu{e} {propre|propres}, merci !",
    "Rendu{e} avec une batterie vide.",
    "Rendu{e}, mais il manque un embout.",
  ],
  en: [
    "Returned in good condition.",
    "Came back clean, thanks!",
    "Returned with a flat battery.",
    "Back, but one bit is missing.",
  ],
};

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------
export const INSURERS: M<string[]> = {
  fr: ["MAIF", "MACIF", "Matmut", "AXA", "Groupama", "GMF"],
  ch: ["La Mobilière", "Helvetia", "Baloise", "AXA", "Zurich"],
  uk: ["Aviva", "Direct Line", "AXA", "LV="],
};

/** What people write about their own home policy. */
export const INSURANCE_NOTES: L<string[]> = {
  fr: [
    "Multirisque habitation, option objets de valeur.",
    "Contrat habitation, garantie vol et dégâts des eaux.",
    "Habitation, rééquipement à neuf.",
    "Habitation + option appareils nomades.",
  ],
  en: [
    "Home contents, accidental damage cover.",
    "Contents insurance with personal possessions.",
    "Home insurance, new-for-old.",
  ],
};

export const GADGET_INSURANCE: L<{ provider: string; note: string }> = {
  fr: { provider: "Assurance mobile", note: "Casse et vol pour le téléphone." },
  en: {
    provider: "Gadget cover",
    note: "Accidental damage and theft for the phone.",
  },
};

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------
export interface CustomAlertSpec {
  text: L<string>;
  months: number | null;
  /** Catalog keys or categories this reminder naturally attaches to. */
  attach?: { keys?: string[]; category?: Category };
  house?: boolean;
}

export const CUSTOM_ALERTS: CustomAlertSpec[] = [
  {
    text: { fr: "Entretien de la chaudière", en: "Boiler service" },
    months: 12,
    house: true,
  },
  {
    text: { fr: "Ramonage de la cheminée", en: "Chimney sweep" },
    months: 12,
    house: true,
  },
  {
    text: {
      fr: "Changer les piles du détecteur de fumée",
      en: "Test the smoke alarm",
    },
    months: 12,
  },
  {
    text: {
      fr: "Renouveler l'assurance habitation",
      en: "Renew home insurance",
    },
    months: 12,
  },
  {
    text: { fr: "Purger les radiateurs", en: "Bleed the radiators" },
    months: 12,
  },
  {
    text: {
      fr: "Détartrer la machine à café",
      en: "Descale the coffee machine",
    },
    months: 3,
    attach: { keys: ["nespresso-vertuo", "delonghi"] },
  },
  {
    text: {
      fr: "Nettoyer le filtre du lave-vaisselle",
      en: "Clean the dishwasher filter",
    },
    months: 1,
    attach: { keys: ["bosch-sms6"] },
  },
  {
    text: { fr: "Révision du vélo", en: "Bike service" },
    months: 12,
    attach: { category: "VEHICLE" },
  },
  {
    text: { fr: "Affûter et farter les skis", en: "Get the skis waxed" },
    months: 12,
    attach: { keys: ["skis", "snowboard"] },
  },
  {
    text: { fr: "Faire accorder le piano", en: "Piano tuning" },
    months: 12,
    attach: { keys: ["upright-piano"] },
  },
  {
    text: { fr: "Hiverner la tondeuse", en: "Winterise the lawn mower" },
    months: 12,
    attach: { keys: ["mower"] },
    house: true,
  },
];

export const LOAN_REMINDER: L<(who: string, what: string) => string> = {
  fr: (w, a) => `Récupérer ${a} chez ${w}`,
  en: (w, a) => `Get the ${a} back from ${w}`,
};

// ---------------------------------------------------------------------------
// Saved views, templates, wishlist
// ---------------------------------------------------------------------------
export const SAVED_VIEWS: { name: L<string>; query: string }[] = [
  {
    name: { fr: "Garanties expirées", en: "Expired warranties" },
    query: "warrantyStatus=expired",
  },
  {
    name: { fr: "Garanties bientôt finies", en: "Warranties ending soon" },
    query: "warrantyStatus=expiringSoon",
  },
  {
    name: { fr: "Objets de valeur", en: "Valuables" },
    query: "priceMin=1000&sort=purchasePrice&dir=desc",
  },
  { name: { fr: "High-tech", en: "Tech" }, query: "category=ELECTRONICS" },
  { name: { fr: "Atelier", en: "Workshop" }, query: "category=TOOL" },
];

export const TEMPLATE_NAMES: Partial<Record<Category, L<string>>> = {
  ELECTRONICS: { fr: "Nouvel appareil high-tech", en: "New gadget" },
  APPLIANCE: { fr: "Électroménager", en: "Kitchen appliance" },
  TOOL: { fr: "Outil", en: "Tool" },
  VEHICLE: { fr: "Vélo", en: "Bike" },
};

export const WISHLIST_NOTES: L<string[]> = {
  fr: [
    "Attendre les soldes.",
    "Pour Noël ?",
    "Comparer avec le modèle précédent.",
    "Vu en magasin, à essayer.",
    "Si le vieux lâche.",
  ],
  en: [
    "Wait for the sales.",
    "Christmas list?",
    "Compare with last year's model.",
    "Saw it in store, want to try it.",
    "When the old one dies.",
  ],
};

// ---------------------------------------------------------------------------
// Marketplace conversations
// ---------------------------------------------------------------------------
export type Topic =
  | "available"
  | "condition"
  | "works"
  | "warranty"
  | "receipt";

export const THREAD_OPENERS: L<
  { topic: Topic; text: (item: string) => string }[]
> = {
  fr: [
    {
      topic: "available",
      text: (i) => `Bonjour, « ${i} » est toujours disponible ?`,
    },
    {
      topic: "available",
      text: () => "Bonjour, l'annonce est toujours d'actualité ?",
    },
    {
      topic: "condition",
      text: () => "Salut, je serais intéressé. Il y a des traces d'usure ?",
    },
    { topic: "works", text: () => "Bonjour ! Tout fonctionne bien ?" },
    { topic: "warranty", text: () => "Bonjour, la garantie court toujours ?" },
    { topic: "receipt", text: () => "Bonjour, vous avez encore la facture ?" },
  ],
  en: [
    { topic: "available", text: (i) => `Hi, is the ${i} still available?` },
    {
      topic: "condition",
      text: () => "Hi, I'm interested. Any marks or wear?",
    },
    { topic: "works", text: () => "Hello! Does everything work fine?" },
    { topic: "warranty", text: () => "Hi, is it still under warranty?" },
    { topic: "receipt", text: () => "Hello, do you still have the receipt?" },
  ],
};

export const OWNER_REPLIES: L<
  Record<Topic, string[]> & {
    warrantyUntil: (when: string) => string;
    warrantyOver: string;
  }
> = {
  fr: {
    available: [
      "Oui, toujours dispo !",
      "Oui ! Je peux vous envoyer d'autres photos si besoin.",
    ],
    condition: [
      "Très bon état, quelques petites traces d'usage.",
      "Comme neuf, je l'ai très peu utilisé.",
    ],
    works: [
      "Oui, tout fonctionne parfaitement.",
      "Aucun souci, il marche très bien.",
    ],
    warranty: [],
    receipt: [
      "Oui, je l'ai gardée, je vous l'envoie.",
      "Oui, et la boîte d'origine aussi.",
    ],
    warrantyUntil: (w) => `Oui, jusqu'en ${w}.`,
    warrantyOver:
      "Non, elle est terminée, mais il n'a jamais eu le moindre souci.",
  },
  en: {
    available: ["Yes, still available!", "Yes! Happy to send more photos."],
    condition: [
      "Very good condition, a few small marks.",
      "Like new, barely used.",
    ],
    works: [
      "Yes, everything works perfectly.",
      "No problems at all, works great.",
    ],
    warranty: [],
    receipt: [
      "Yes, I kept it, I'll send you a copy.",
      "Yes, and the original box too.",
    ],
    warrantyUntil: (w) => `Yes, until ${w}.`,
    warrantyOver: "No, it's run out, but it's never had a single problem.",
  },
};

export const OFFER_TEXT: L<(amount: string) => string> = {
  fr: (a) => `Je vous en propose ${a}, ça vous irait ?`,
  en: (a) => `Would you take ${a}?`,
};

export const OFFER_REPLIES: L<{ ACCEPTED: string; DECLINED: string }> = {
  fr: {
    ACCEPTED: "Ok pour moi, je lance le transfert.",
    DECLINED: "Merci, mais c'est un peu bas pour moi.",
  },
  en: {
    ACCEPTED: "Deal, I'll start the transfer.",
    DECLINED: "Thanks, but that's a bit low for me.",
  },
};

export const TRANSFER_MESSAGES: L<{ PUSH: string; PULL: string }> = {
  fr: {
    PUSH: "Je te le passe, dis-moi si ça te va.",
    PULL: "Je veux bien le récupérer si tu ne t'en sers plus.",
  },
  en: {
    PUSH: "Passing this on to you, let me know.",
    PULL: "Happy to take this off your hands if you're not using it.",
  },
};

// ---------------------------------------------------------------------------
// Custom fields people actually add
// ---------------------------------------------------------------------------
export const FIELD_LABELS: Record<FieldKey, L<string>> = {
  storage: { fr: "Stockage", en: "Storage" },
  colour: { fr: "Couleur", en: "Colour" },
  size: { fr: "Taille", en: "Size" },
  frame: { fr: "Taille du cadre", en: "Frame size" },
  material: { fr: "Matière", en: "Material" },
  dimensions: { fr: "Dimensions", en: "Dimensions" },
  energy: { fr: "Classe énergie", en: "Energy rating" },
  strings: { fr: "Cordes", en: "Strings" },
};

export const FIELD_VALUES: Record<FieldKey, L<string[]>> = {
  storage: {
    fr: ["128 Go", "256 Go", "512 Go", "1 To"],
    en: ["128GB", "256GB", "512GB", "1TB"],
  },
  colour: {
    fr: [
      "Noir",
      "Blanc",
      "Gris sidéral",
      "Bleu",
      "Argent",
      "Vert sauge",
      "Rouge",
    ],
    en: ["Black", "White", "Space grey", "Blue", "Silver", "Sage", "Red"],
  },
  size: {
    fr: ["S", "M", "L", "XL", "38", "42", "44", "52"],
    en: ["S", "M", "L", "XL", "UK 8", "UK 10", "42mm"],
  },
  frame: { fr: ["S", "M", "L"], en: ["S", "M", "L", '17"', '19"'] },
  material: {
    fr: ["Or 18 carats", "Or blanc", "Argent 925", "Platine"],
    en: ["18ct gold", "White gold", "Sterling silver", "Platinum"],
  },
  dimensions: {
    fr: [
      "160 × 200",
      "140 × 190",
      "180 × 90",
      "55 pouces",
      "65 pouces",
      "60 × 60 × 85 cm",
    ],
    en: ["King size", "Double", "180 × 90 cm", '55"', '65"'],
  },
  energy: { fr: ["A", "B", "C", "D"], en: ["A", "B", "C", "D"] },
  strings: {
    fr: ["Elixir 10-46", "D'Addario 12-53"],
    en: ["Elixir 10-46", "D'Addario 12-53"],
  },
};

export const BUNDLE_LABELS: Record<BundleKey, L<string>> = {
  office: { fr: "Bureau", en: "Home office" },
  camera: { fr: "Kit photo", en: "Camera kit" },
  ski: { fr: "Ski", en: "Ski gear" },
  workshop: { fr: "Atelier", en: "Workshop" },
  kitchen: { fr: "Cuisine", en: "Kitchen" },
  baby: { fr: "Bébé", en: "Baby" },
  hifi: { fr: "Salon TV / hifi", en: "Hi-fi" },
};

/** How people mark whose it is when the household has several. */
/** Gender and number of a catalogue noun, for the French notes that agree
 *  with the thing they describe ("Offerte pour Noël" for a watch). */
export type Form = "m" | "f" | "mp" | "fp";

const FR_FORMS: Record<string, Form> = {
  alliances: "fp",
  ampoules: "fp",
  armoire: "f",
  bague: "f",
  barre: "f",
  batterie: "f",
  boots: "fp",
  bouilloire: "f",
  caméra: "f",
  chaises: "fp",
  chaussures: "fp",
  climatisation: "f",
  clubs: "mp",
  collection: "f",
  console: "f",
  doudoune: "f",
  enceinte: "f",
  friteuse: "f",
  guitare: "f",
  imprimante: "f",
  liseuse: "f",
  lits: "mp",
  machine: "f",
  montre: "f",
  parka: "f",
  "perceuse-visseuse": "f",
  planche: "f",
  plaque: "f",
  platine: "f",
  ponceuse: "f",
  poussette: "f",
  raquette: "f",
  remorque: "f",
  robe: "f",
  scie: "f",
  skis: "mp",
  table: "f",
  tablette: "f",
  tente: "f",
  tondeuse: "f",
  tronçonneuse: "f",
  trottinette: "f",
  télé: "f",
  valise: "f",
  veste: "f",
  visseuse: "f",
  voiture: "f",
  écouteurs: "mp",
  étagère: "f",
};

/** "Montre connectée" → "f"; anything not listed is masculine singular. */
export function frForm(nounFr: string): Form {
  return FR_FORMS[nounFr.split(" ")[0].toLowerCase()] ?? "m";
}

const FORM_INDEX: Record<Form, number> = { m: 0, f: 1, mp: 2, fp: 3 };

/** Make a French note agree with its noun. Tokens: `{e}` (the regular
 *  ending: "", e, s, es), `{m/f/mp/fp}` (four spelled-out forms) and
 *  `{singular|plural}`. Text without tokens (every English line) passes
 *  through unchanged. */
export function agree(text: string, form: Form): string {
  const i = FORM_INDEX[form];
  const plural = form === "mp" || form === "fp";
  return text
    .replace(/\{e\}/g, ["", "e", "s", "es"][i])
    .replace(
      /\{([^{}|/]*)\/([^{}|/]*)\/([^{}|/]*)\/([^{}|/]*)\}/g,
      (...m) => m[1 + i]
    )
    .replace(/\{([^{}|/]*)\|([^{}|/]*)\}/g, (_, sg, pl) => (plural ? pl : sg));
}

/** "de Jules", but "d'Emma" and "d'Hugo": French elides "de" before a
 *  vowel or a mute h (no first name here starts with an aspirated h; a "Y"
 *  name like Yanis is consonantal). */
export function deName(name: string): string {
  return /^[AEIOUÉÈÊÂÎÔHaeiouéèêâîôh]/.test(name) ? `d'${name}` : `de ${name}`;
}

export const WITH_OWNER: L<(base: string, name: string) => string> = {
  fr: (b, n) => `${b} ${deName(n)}`,
  en: (b, n) => `${n}'s ${b}`,
};

/** How people name the paperwork they attach; `{…}` filled per document. */
export const DOCUMENT_FILE_NAMES: L<{
  invoice: string[];
  receipt: string[];
  warranty: string[];
}> = {
  fr: {
    invoice: [
      "Facture_{shopSlug}_{number}.pdf",
      "facture {shop}.pdf",
      "Facture.pdf",
    ],
    receipt: [
      "Scan ticket {date}.pdf",
      "ticket de caisse {shop}.pdf",
      "Scan {isoDate} {time}.pdf",
    ],
    warranty: [
      "Garantie {brand}.pdf",
      "Certificat de garantie.pdf",
      "Scan garantie {date}.pdf",
    ],
  },
  en: {
    invoice: ["Invoice_{shopSlug}_{number}.pdf", "invoice {shop}.pdf"],
    receipt: ["Receipt scan {date}.pdf", "receipt {shop}.pdf"],
    warranty: ["Warranty {brand}.pdf", "Warranty certificate.pdf"],
  },
};
