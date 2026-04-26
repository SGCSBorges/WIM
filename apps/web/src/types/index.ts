// Shared domain types used across multiple components.

export interface ArticleWarranty {
  garantieId?: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin?: string | null;
  garantieIsValide?: boolean;
  garantieImageAttachmentId?: number | null;
  garantieImageAttachment?: {
    fileName: string;
    mimeType: string;
    fileUrl: string;
  } | null;
}

export interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  sharedWithPowerUsers?: boolean;
  locationIds?: number[];
  locations?: Array<{ locationId: number; location?: { name: string } }>;
  garantie?: ArticleWarranty | null;
}

/** Article as returned by the API — always has an articleId. */
export interface FetchedArticle extends Article {
  articleId: number;
}

export interface Location {
  locationId: number;
  name: string;
}
