// Re-export shared domain types from @wim/types so existing imports keep working.
// New code should import directly from "@wim/types".
export type {
  Article,
  ArticleListParams,
  ArticleListResult,
  ArticleNote,
  ArticleNoteKind,
  ArticleWarranty,
  BillingSubscription,
  ClaimStatus,
  FetchedArticle,
  Location,
  SavedView,
  ShareInviteItem,
  ShareItem,
  SharedArticleRow,
  Tag,
  WarrantyItem,
} from "@wim/types";
