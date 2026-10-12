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
  "fuji-xt5": [
    {
      file: "fuji-xt5.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Fujifilm_X-T5.jpg",
      author: "Müllowitsch",
      licence: "CC0",
      licenceUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
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
  thermomix: [
    {
      file: "thermomix.jpg",
      source: "https://commons.wikimedia.org/wiki/File:Thermomix_TM6.jpg",
      author: "EinAnonymerBenutzerVonVielen",
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
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
};
