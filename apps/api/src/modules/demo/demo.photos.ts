/**
 * Product photos for seeded articles: Wikimedia Commons images, each checked
 * by eye, resized and committed under `apps/api/assets/demo-photos/` so the
 * seed never hot-links. They are stored through the upload path like any
 * photo a user adds, so they list, open and delete like real attachments.
 *
 * Where Commons has a free photo of the catalogue's exact model, that is the
 * entry. Otherwise the entry shows a similar product of the same kind (the
 * same brand where one could be found) and is marked `similar`: a demo where
 * most articles have no picture reads worse than one with a close match.
 *
 * Commons licences require credit: every entry names its author, licence
 * and source page, the attachment's file name carries author and licence
 * next to the picture, and `assets/demo-photos/CREDITS.md` lists them all.
 */
import path from "path";

export interface DemoPhoto {
  /** File name under assets/demo-photos. */
  file: string;
  /** The colour the photo shows, for products with a colour field; an
   *  article showing this photo records this colour. */
  colour?: { fr: string; en: string };
  /** Commons file page. */
  source: string;
  author: string;
  licence: string;
  licenceUrl: string | null;
  /** Not the exact model but the same kind of product. Its `colour`, when
   *  set, is still one the model was sold in; without one, the article's
   *  recorded colour is picked from the model's own. */
  similar?: true;
}

export const PHOTO_DIR = path.resolve(__dirname, "../../../assets/demo-photos");

export const DEMO_PHOTOS: Readonly<Record<string, readonly DemoPhoto[]>> = {
  a54: [
    {
      file: "a54.jpg",
      colour: { fr: "Blanc", en: "White" },
      source:
        "https://commons.wikimedia.org/wiki/File:Back_of_the_Samsung_Galaxy_A54_5G.jpg",
      author: "Hajoon0102",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  aeron: [
    {
      file: "aeron.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Aeron_Chair_(4446434022).jpg",
      author: "Robert from Zoetermeer, Netherlands",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  airfryer: [
    {
      file: "airfryer.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Airfryer_Convert.jpg",
      author: "Maurina Rara",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  airpods4: [
    {
      file: "airpods4.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Airpods_4.jpg",
      author: "AppleFans 1",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  airpodspro2: [
    {
      file: "airpodspro2.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:AirPods_Pro_(2nd_generation).jpg",
      author: "Hajoon0102",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  anker: [
    {
      file: "anker.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Anker_power_bank_lit.jpg",
      author: "Saucy",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  aw9: [
    {
      file: "aw9.jpg",
      colour: { fr: "Minuit", en: "Midnight" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:9_Tux_logos_on_Apple_Watch_Series_8.jpeg",
      author: "Dancingpolishcow",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  babyzen: [
    {
      file: "babyzen.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:BabyCarriage_20210711_130332.jpg",
      author: "Ka23 13",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  barbour: [
    {
      file: "barbour.jpg",
      colour: { fr: "Olive", en: "Olive" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Green_Barbour_Endurance_jacket.jpg",
      author: "Robert Sheie",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "bd-collection": [
    {
      file: "bd-collection.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Albums_du_vagabond_des_limbes.jpg",
      author: "Mystery Man From Outerspace",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "bike-trailer": [
    {
      file: "bike-trailer.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:295-V%C3%A9lo_Giant_et_remorque_porte-enfant.jpg",
      author: "Cjp24",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "bosch-drill": [
    {
      file: "bosch-drill.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Bosch_drilling_machine.jpg",
      author: "Sunnybansodeva",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "bosch-dryer": [
    {
      file: "bosch-dryer.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Tumble_Dryer_2.JPG",
      author: "Sweetie candykim",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  "bosch-sms6": [
    {
      file: "bosch-sms6.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Bosch_Dishwasher_2026-08-23_3.jpg",
      author: "Yelderberry",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  brompton: [
    {
      file: "brompton.jpg",
      colour: { fr: "Vert anglais", en: "Racing Green" },
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Brompton_ventoux.JPG",
      author: "Flurin",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "bunk-bed": [
    {
      file: "bunk-bed.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Qsh_dorm_bunk_beds_(10943035686).jpg",
      author: "Barnacles Budget Accommodation from Ireland",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "car-seat": [
    {
      file: "car-seat.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Inglesina_Marco_Polo_car_seat.jpg",
      author: "Niklitov",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  cargo: [
    {
      file: "cargo.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Babboe_Curve_at_Flying_Pigeon_LA_bike_shop_(15107108050).jpg",
      author: "Umberto Brayj",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  carrera: [
    {
      file: "carrera.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:TAG_Heuer_Carrera_chronograph_CV2010_retusche.jpg",
      author: "Pinback66, derivative work Lämpel",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "cartier-tank": [
    {
      file: "cartier-tank.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Cartier_Tank_Must,_2021.jpg",
      author: "EMore98",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  chainsaw: [
    {
      file: "chainsaw.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:%E3%83%81%E3%82%A7%E3%83%B3%E3%82%BD%E3%83%BC_STIHL_MS170C_Chainsaw_(5290190254).jpg",
      author: "Laineema",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  concept2: [
    {
      file: "concept2.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:%E9%A3%8E%E9%98%BB%E5%88%92%E8%88%B9%E5%99%A8%EF%BC%88Concept2_E%E5%9E%8B%E5%88%92%E8%88%B9%E5%99%A8%EF%BC%89.JPG",
      author: "Nick3488",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  cookeo: [
    {
      file: "cookeo.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:%D0%9C%D1%83%D0%BB%D1%8C%D1%82%D0%B8%D0%B2%D0%B0%D1%80%D0%BA%D0%B0_Moulinex_Simply_Cook.jpg",
      author: "Зарэгался",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  "daikin-ac": [
    {
      file: "daikin-ac.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:DAIKIN_AIR_CONDITIONER_INDOOR_UNIT_(14).jpg",
      author: "Dinkun Chen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  delonghi: [
    {
      file: "delonghi.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:EKI_na_CAFE.JPG",
      author: "VVVN",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "dewalt-saw": [
    {
      file: "dewalt-saw.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:DeWalt_circular_saw.jpg",
      author: "Mark Hunter",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "dining-chairs": [
    {
      file: "dining-chairs.jpg",
      colour: { fr: "Chêne", en: "Oak" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Danish_Rosewood_Dining_Chair-3.jpg",
      author: "Tangerineduel",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "dining-table": [
    {
      file: "dining-table.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Markedshallen_(Dining_table).jpg",
      author: "RhinoMind",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "dji-mini4": [
    {
      file: "dji-mini4.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:2024_Dron_DJI_Mini_4_Pro_(01).jpg",
      author: "Jacek Halicki",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  docs: [
    {
      file: "docs.jpg",
      colour: { fr: "Noir", en: "Black" },
      source:
        "https://commons.wikimedia.org/wiki/File:Doctors_1460_Black_Worn.jpg",
      author: "IlPasseggero",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  domane: [
    {
      file: "domane.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:2012_Trek_1.1_Road_Bike.jpg",
      author: "Polloloco51",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "dyson-purifier": [
    {
      file: "dyson-purifier.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Purificatore_Dyson.jpg",
      author: "Air fans",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  "dyson-v15": [
    {
      file: "dyson-v15.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:A_Dyson_vacuum_cleaner.jpg",
      author: "Tbatb",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "e-scooter": [
    {
      file: "e-scooter.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Xiaomi_M365_Pro_2.jpg",
      author: "Terminator216",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  eames: [
    {
      file: "eames.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Eames_Lounge_Chair_-_side.jpg",
      author: "Casey Marshall",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "emma-mattress": [
    {
      file: "emma-mattress.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:2022-08-19_12_28_06_King-size_Caitbrook_Gray_Full_Storage_Bed_with_a_Medium_to_Firm_Luxury_Cooling_Beautyrest_Black_mattress_in_the_master_bedroom_of_a_house_along_Aquetong_Lane_in_the_Mountainview_section_of_Ewing_Township,_Mercer_County,_New_Jersey.jpg",
      author: "Famartin",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "engagement-ring": [
    {
      file: "engagement-ring.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Vintage_diamond_engagement_ring.jpg",
      author: "CatherineLewis1976",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "eos-r6m2": [
    {
      file: "eos-r6m2.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Canon_EOS_R6_Mark_II_-_by_Henry_S%C3%B6derlund_(52546794891).jpg",
      author: "Henry Söderlund from Helsinki, Finland",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "epson-ecotank": [
    {
      file: "epson-ecotank.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:EPSON_L1218_Multifunction_ink-jet_Printer.jpg",
      author: "Dinkun Chen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  era100: [
    {
      file: "era100.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Sonos_One_Speaker_(49671374307).jpg",
      author: "Ajay Suresh from New York, NY, USA",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  era300: [
    {
      file: "era300.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Sonos_PLAY_5_Wireless_speaker_with_pencil_as_size_comparison.jpg",
      author: "Pittigrilli",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  fenix7: [
    {
      file: "fenix7.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:GarminFenix6X.jpg",
      author: "Wvangeit",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "festool-ts55": [
    {
      file: "festool-ts55.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:0x-tauchkreis-1.jpg",
      author: "Oxensepp",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "fuji-xt5": [
    {
      file: "fuji-xt5.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Fujifilm_X-T5.jpg",
      author: "Müllowitsch",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  "garden-set": [
    {
      file: "garden-set.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Garden_furniture_at_Nuthurst_West_Sussex_England.jpg",
      author: "Acabashi",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  golf: [
    {
      file: "golf.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Golf_club,_Callaway_X-20_8_iron.jpg",
      author: "Fpedraza",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "goose-parka": [
    {
      file: "goose-parka.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Sled_Dog_Discovery_%26_Musher%27s_Camp_34.jpg",
      author: "Wknight94",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  gopro12: [
    {
      file: "gopro12.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Cyclisme_%26_GoPro_-_GoPro_Hero_4_(03).JPG",
      author: "Jérémy-Günther-Heinz Jähnick",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "hedge-trimmer": [
    {
      file: "hedge-trimmer.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Hedge_trimmers.JPG",
      author: "KVDP",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "hue-kit": [
    {
      file: "hue-kit.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Philips_Hue_hub_and_2_bulbs.jpg",
      author: "Sho Hashimoto",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  induction: [
    {
      file: "induction.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Induktionsh%C3%A4ll.JPG",
      author: "Grillo",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  ipad10: [
    {
      file: "ipad10.jpg",
      colour: { fr: "Rose", en: "Pink" },
      source: "https://commons.wikimedia.org/wiki/File:Ipadtenthgen.jpg",
      author: "Wiikiipediia",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "ipadair-m2": [
    {
      file: "ipadair-m2.jpg",
      colour: { fr: "Bleu", en: "Blue" },
      source:
        "https://commons.wikimedia.org/wiki/File:IPad_Air_11-inch_(M2)_back_side_(20250525_154602).jpg",
      author: "茅野ふたば",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  iphone13: [
    {
      file: "iphone13.jpg",
      colour: { fr: "Minuit", en: "Midnight" },
      source:
        "https://commons.wikimedia.org/wiki/File:IPhone_13_and_iPhone_14_Plus.jpg",
      author: "Kskhh",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  iphone15pro: [
    {
      file: "iphone15pro.jpg",
      colour: { fr: "Titane naturel", en: "Natural Titanium" },
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:IPhone_15_pro_max.png",
      author: "Ka Kit Pang",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  iphone16: [
    {
      file: "iphone16.jpg",
      colour: { fr: "Outremer", en: "Ultramarine" },
      source:
        "https://commons.wikimedia.org/wiki/File:IPhone_16_Ultramarine_Rear.png",
      author: "Padgriffin",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "jbl-flip6": [
    {
      file: "jbl-flip6.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:JBL_Flip_4.jpg",
      author: "Freekhou5",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  kallax: [
    {
      file: "kallax.jpg",
      colour: { fr: "Effet chêne blanchi", en: "White stained oak effect" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Part_of_an_IKEA_bookshelf_with_popular_fiction_etc.jpg",
      author: "Roman Eisele",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "karcher-k5": [
    {
      file: "karcher-k5.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:KARCHER_5_85.jpg",
      author: "Piglet",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  kayak: [
    {
      file: "kayak.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Inflatable_kayak_at_Manning_River.jpg",
      author: "JaredMcKenzie",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  "kids-bike": [
    {
      file: "kids-bike.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Kids_bikes_balance.jpg",
      author: "Vaibhavratnaparkhi",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  kindle: [
    {
      file: "kindle.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Amazon_Kindle_Paperwhite_5_Eleventh_Generation_(C2V2L3)_6-inch_e-reader.jpg",
      author: "WrS.tm.pl",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  kitchenaid: [
    {
      file: "kitchenaid.jpg",
      colour: { fr: "Rouge empire", en: "Empire Red" },
      source:
        "https://commons.wikimedia.org/wiki/File:Red_KitchenAid_Artisan.jpg",
      author: "BenFrantzDale",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    },
  ],
  "laser-level": [
    {
      file: "laser-level.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Construction_laser.jpg",
      author: "Jensens",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "lego-falcon": [
    {
      file: "lego-falcon.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Millennium_falcon_lego.jpg",
      author: "Cappo80",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "leica-m6": [
    {
      file: "leica-m6.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Leica_M6_TTL_front.jpg",
      author: "Sodacan",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "lg-washer": [
    {
      file: "lg-washer.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:LG_F1402FDS_20170521.jpg",
      author: "Zuissii",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  longchamp: [
    {
      file: "longchamp.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Longchamp_upper_sales_floor.jpg",
      author: "Dogears",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "makita-impact": [
    {
      file: "makita-impact.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Makita_BTD146_18v_lithium-ion_impact_driver_(6169707376).jpg",
      author: "Mark Hunter",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  malm: [
    {
      file: "malm.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Malm_bed_from_Ikea,_Brisbane,_Australia.jpg",
      author: "Kgbo",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "mba13-m2": [
    {
      file: "mba13-m2.jpg",
      colour: { fr: "Argent", en: "Silver" },
      source:
        "https://commons.wikimedia.org/wiki/File:MacBook_Air_(A2681)_Interface.jpg",
      author: "メイド理世",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "mba13-m3": [
    {
      file: "mba13-m3.jpg",
      colour: { fr: "Lumière stellaire", en: "Starlight" },
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Macbook_Air.png",
      author: "嘉傑",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "mbp14-2021": [
    {
      file: "mbp14-2021.jpg",
      colour: { fr: "Argent", en: "Silver" },
      source:
        "https://commons.wikimedia.org/wiki/File:A_2021_14-inch_Silver_MacBook_Pro_(cropped).jpg",
      author: "Oops4321",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  microwave: [
    {
      file: "microwave.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:HK_residential_building_microwave_oven_August_2021_SS2.jpg",
      author: "Wendaoz Saimu",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "miele-washer": [
    {
      file: "miele-washer.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Miele_Washing_Machine_Novotronic_W985_WPS.jpg",
      author: "J.",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  moncler: [
    {
      file: "moncler.jpg",
      colour: { fr: "Noir", en: "Black" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Moncler_doudoune_logo.jpg",
      author: "Arroser",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "monitor-27": [
    {
      file: "monitor-27.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Dell_U3415W_monitor_and_Latitude_laptop_(1).jpg",
      author: "William Murphy",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    },
  ],
  montblanc: [
    {
      file: "montblanc.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Montblanc_149_nibs_(DSC02303).jpg",
      author: "Michael de Silva",
      licence: "CC BY 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by/3.0",
    },
  ],
  moustache: [
    {
      file: "moustache.jpg",
      colour: { fr: "Noir", en: "Black" },
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Moustache_Lundi_26.JPG",
      author: "Sylenius",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  mower: [
    {
      file: "mower.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Viking_lawn_mower.jpg",
      author: "kallerna",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "nano-puff": [
    {
      file: "nano-puff.jpg",
      colour: { fr: "Orange", en: "Orange" },
      source:
        "https://commons.wikimedia.org/wiki/File:Patagonia_Nano-Puff_Jacket_(51011161655).jpg",
      author: "ajay_suresh",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "nas-ds224": [
    {
      file: "nas-ds224.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Synology_ds213j.jpg",
      author: "Fabian sigrist",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "nespresso-vertuo": [
    {
      file: "nespresso-vertuo.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Nespresso_Vertuo_Pop.jpg",
      author: "Tifa Zabat",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  netatmo: [
    {
      file: "netatmo.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Overview_of_Netatmo_Thermostat_in_Michle,_Prague.jpg",
      author: "Jiří Sedláček",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  neverfull: [
    {
      file: "neverfull.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:HK_%E4%B8%AD%E7%92%B0_Central_%E7%95%A2%E6%89%93%E8%A1%97_Pedder_Street_Des_Voeux_Road_Landmark_shop_Louis_Vuitton_store_window_display_handbag_August_2022_Px3_05.jpg",
      author: "FAIWOODAS Shaumi",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "oled-c3": [
    {
      file: "oled-c3.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:LG_smart_TV.png",
      author: "LG전자",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  oven: [
    {
      file: "oven.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Forno_elettrico_Electrolux_1.jpg",
      author: "Air fans",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  painting: [
    {
      file: "painting.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Jean-Baptiste-Camille_Corot_-_Versant_Rocheux.jpg",
      author: "Jean-Baptiste Camille Corot",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  pax: [
    {
      file: "pax.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:IKEA_Elizabeth_NJ_-_November_2021_-_47.jpg",
      author: "Stilfehler",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "pearl-necklace": [
    {
      file: "pearl-necklace.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Long_pearl_necklace_with_cultured_baroque_saltwater_pearls_4.jpg",
      author: "W.carter",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  peloton: [
    {
      file: "peloton.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Peloton_Bike.jpg",
      author: "SpartyZag",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  pixel8: [
    {
      file: "pixel8.jpg",
      colour: { fr: "Rose", en: "Rose" },
      source:
        "https://commons.wikimedia.org/wiki/File:Google_Pixel_8_Rose_rear_bottom-left.jpg",
      author: "IXTA9839",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "pool-robot": [
    {
      file: "pool-robot.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Aiper_Scuba_N1_Pro_Robotic_Pool_Cleaner.jpg",
      author: "TaurusEmerald",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  ps5: [
    {
      file: "ps5.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:PlayStation_5_and_DualSense_with_transparent_background.png",
      author: "Osh33m (original photo); Soberian (retouched file)",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  ps5pro: [
    {
      file: "ps5pro.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:PlayStation_5_Pro_no_disc_drive.jpg",
      author: "BeatEmUps",
      licence: "CC BY 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by/3.0",
    },
  ],
  qcu: [
    {
      file: "qcu.jpg",
      colour: { fr: "Noir", en: "Black" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Bose_QuietComfort_35_II_Wireless_Headphones.jpg",
      author: "Carsonjp21",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "quechua-tent": [
    {
      file: "quechua-tent.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:White_tent_on_Decathlon_at_SM_City_Cebu_(2024-06-11).jpg",
      author: "Wide Awake!",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  racket: [
    {
      file: "racket.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:ProStaff_Original.jpg",
      author: "Grock9",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  rf24105: [
    {
      file: "rf24105.jpg",
      source: "https://commons.wikimedia.org/wiki/File:CanonR5_24-105.jpg",
      author: "Yerpo",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  rf50: [
    {
      file: "rf50.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Canon_RF_50mm_F1.8_STM.jpg",
      author: "Henry Söderlund",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "roborock-s8": [
    {
      file: "roborock-s8.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Roborock_Q8_Max_plus_robotst%C3%B8vsuger.jpg",
      author: "Ssu",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  rockrider: [
    {
      file: "rockrider.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:MTB_Decathlon_08.jpg",
      author: "SIG SG 510",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  s24u: [
    {
      file: "s24u.jpg",
      colour: { fr: "Gris Titane", en: "Titanium Grey" },
      source:
        "https://commons.wikimedia.org/wiki/File:SAMSUNG_Galaxy_S24_Ultra_(2).jpg",
      author: "Dinkun Chen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "samsung-fridge": [
    {
      file: "samsung-fridge.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:SAMSUNG_REFRIGERATOR_RF60J9030WZ.jpg",
      author: "Dinkun Chen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "samsung-qled65": [
    {
      file: "samsung-qled65.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Samsung_Smart_TV_2012_(E-Series).jpg",
      author: "Dancingpolishcow",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  sander: [
    {
      file: "sander.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Makita_BO5041_Random_Orbit_Sander_(6169695568).jpg",
      author: "Mark Hunter",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "seiko-presage": [
    {
      file: "seiko-presage.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:SEIKO_Watch_SBTM323.jpg",
      author: "Buehl106",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "ski-boots": [
    {
      file: "ski-boots.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Ski_boots_alpin_large.jpg",
      author: "Chianti90",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "ski-jacket": [
    {
      file: "ski-jacket.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Skieur.jpg",
      author: "einchtien",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  skis: [
    {
      file: "skis.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Rossignol_Experience_88_Ti_Skis.jpg",
      author: "Викидим",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "smeg-kettle": [
    {
      file: "smeg-kettle.jpg",
      colour: { fr: "Crème", en: "Cream" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Electric_kettle_phillips_white.JPG",
      author: "Rafa",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  snowboard: [
    {
      file: "snowboard.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Burtons,_Burtons_everywhere_(26903301882).jpg",
      author: "Ruth Hartnup from Vancouver, Canada",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  sofa: [
    {
      file: "sofa.jpg",
      colour: { fr: "Beige", en: "Beige" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Berlin,_Museum_Europ%C3%A4ischer_Kulturen,_GLAM_on_Tour_im_Museum_Europ%C3%A4ischer_Kulturen_(2018)_NIK_5767.jpg",
      author: "Nightflyer",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "sonos-arc": [
    {
      file: "sonos-arc.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Sonos_soundbar,_2021.jpg",
      author: "Ssu",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  speedmaster: [
    {
      file: "speedmaster.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Classic_Speedy_(24067321725).jpg",
      author: "Daniel Zimmermann from Bayern, Deutschland (Germany)",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "standing-desk": [
    {
      file: "standing-desk.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Standing_desk.jpg",
      author: "Wikideas1",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  strat: [
    {
      file: "strat.jpg",
      colour: { fr: "Sunburst trois tons", en: "3-Colour Sunburst" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:American_Professional_II_Fender_Telecaster_Deluxe.jpg",
      author: "StringDTD",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  submariner: [
    {
      file: "submariner.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Rolex_Submariner_Professional.JPG",
      author: "Dr.K.",
      licence: "CC BY-SA 3.0",
      licenceUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    },
  ],
  suit: [
    {
      file: "suit.jpg",
      colour: { fr: "Gris anthracite", en: "Charcoal" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Shooting_de_Mannequin_!_(8353507873).jpg",
      author: "Grand Parc - Bordeaux, France from France",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  suitcase: [
    {
      file: "suitcase.jpg",
      colour: { fr: "Argent", en: "Silver" },
      source: "https://commons.wikimedia.org/wiki/File:Samsonite_Proxis.jpg",
      author: "Joerivho",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  surfboard: [
    {
      file: "surfboard.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Kuta002.jpg",
      author: "Shoestring",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  "switch-oled": [
    {
      file: "switch-oled.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Nintendo-Switch-OLED-Docked.jpg",
      author: "PantheraLeo1359531",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  switch2: [
    {
      file: "switch2.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Nintendo_Switch_2_in_Docking_Console.jpg",
      author: "Crisco 1492",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  taylor: [
    {
      file: "taylor.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:TGFT01_Play_away_-_Taylor_Guitar_Factory.jpg",
      author: "Marcin Wichary",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  thermomix: [
    {
      file: "thermomix.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Thermomix_TM6.jpg",
      author: "EinAnonymerBenutzerVonVielen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "thinkpad-x1": [
    {
      file: "thinkpad-x1.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Lenovo_ThinkPad_X1_Carbon_014_(10774123843).jpg",
      author: "TAKA@P.P.R.S",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    },
  ],
  "tiffany-pendant": [
    {
      file: "tiffany-pendant.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Tiffany_and_Company_-_Sautoir_with_Pearl_Pendant_-_Walters_572034.jpg",
      author: "Tiffany & Co.",
      licence: "Public domain",
      licenceUrl: null,
    },
  ],
  trampoline: [
    {
      file: "trampoline.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:The_trampoline_in_the_garden_-_geograph.org.uk_-_1831334.jpg",
      author: "kevin rothwell",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    },
  ],
  treadmill: [
    {
      file: "treadmill.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Treadmill_from_Viking_Sport,_side.jpg",
      author: "W.carter",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  "trek-marlin": [
    {
      file: "trek-marlin.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Trek_4500_mountain_bike_McDonald%27s_restaurant_Broad_Street_Lyndonville_VT_June_2016.jpg",
      author: "Artaxerxes",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  turntable: [
    {
      file: "turntable.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Rega_Planar_3_(15207686017).jpg",
      author: "Jacques from Cape Town, South Africa",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  "upright-piano": [
    {
      file: "upright-piano.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Yamaha_U1.jpg",
      author: "Daniel Christensen",
      licence: "CC BY 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by/3.0",
    },
  ],
  vado: [
    {
      file: "vado.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Specialized_TURBO_VADO_3.0.jpg",
      author: "Klishist",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  vespa: [
    {
      file: "vespa.jpg",
      colour: { fr: "Verde Amabile", en: "Verde Amabile" },
      source:
        "https://commons.wikimedia.org/wiki/File:Piaggio_Vespa_Primavera_125.jpg",
      author: "Corvettec6r",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0",
    },
  ],
  weber: [
    {
      file: "weber.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Grilling_ribs_on_the_Weber_Gas_Grill.jpg",
      author: "Corvair Owner",
      licence: "CC BY-SA 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    },
  ],
  "wedding-bands": [
    {
      file: "wedding-bands.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Wedding_rings_and_roses.jpg",
      author: "Dako99",
      licence: "CC BY-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  ],
  "wedding-dress": [
    {
      file: "wedding-dress.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Bilbao_-_Tienda_de_Pronovias.jpg",
      author: "Zarateman",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    },
  ],
  workbench: [
    {
      file: "workbench.jpg",
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Early_Workmate_workbench_at_the_Science_Museum,_London_(cropped).jpg",
      author: "Ged Carroll",
      licence: "CC BY 2.0",
      licenceUrl: "https://creativecommons.org/licenses/by/2.0",
    },
  ],
  xm5: [
    {
      file: "xm5.jpg",
      colour: { fr: "Bleu nuit", en: "Midnight Blue" },
      similar: true,
      source:
        "https://commons.wikimedia.org/wiki/File:Sony_WH-CH510_Bluetooth_Over-Ear_Headphone.jpg",
      author: "RPSkokie",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  xps13: [
    {
      file: "xps13.jpg",
      similar: true,
      source: "https://commons.wikimedia.org/wiki/File:Dell_XPS_13_9350.jpg",
      author: "Green-Curtain",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  "yamaha-p125": [
    {
      file: "yamaha-p125.jpg",
      source:
        "https://commons.wikimedia.org/wiki/File:Yamaha_P-125_20190713a.jpg",
      author: "Solomon203",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
  zoe: [
    {
      file: "zoe.jpg",
      colour: { fr: "Blanc Glacier", en: "Glacier White" },
      source:
        "https://commons.wikimedia.org/wiki/File:2020_Renault_Zoe_Intens_R135_Z.E._50.jpg",
      author: "Vauxford",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    },
  ],
};
