// Re-export shared domain types from @wim/types so existing imports keep working.
// New code should import directly from "@wim/types".
export type {
  Article,
  ArticleWarranty,
  FetchedArticle,
  Location,
} from "@wim/types";
