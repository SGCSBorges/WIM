/**
 * Public, read-only item page — the target of a QR label. Renders a
 * privacy-safe card (name / brand / model / description / photo / category +
 * a coarse warranty flag) for anyone with the link; no auth, no app shell.
 * Sensitive fields (price, serial, owner, location) are never sent here.
 */
import { useEffect, useState } from "react";
import { Package, ShieldCheck, ShieldX } from "lucide-react";
import { publicAPI } from "../../services/api";
import type { PublicItem, ArticleCategory } from "../../types";
import { useI18n } from "../../i18n/i18n";
import ArticleThumb from "../articles/ArticleThumb";
import { Badge } from "../ui";

export default function PublicItemView({ token }: { token: string }) {
  const { t } = useI18n();
  const [item, setItem] = useState<PublicItem | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    publicAPI
      .getItem(token)
      .then((i) => {
        if (!alive) return;
        setItem(i);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <main className="ui-card w-full max-w-md p-6">
        {state === "loading" && (
          <p className="text-center text-sm ui-text-muted" role="status">
            {t("common.loading")}
          </p>
        )}

        {state === "error" && (
          <div className="text-center">
            <Package
              className="mx-auto h-10 w-10 ui-text-muted"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm ui-text-muted" role="alert">
              {t("publicItem.notFound")}
            </p>
          </div>
        )}

        {state === "ok" && item && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <ArticleThumb
                src={item.productImageUrl}
                alt={item.articleNom}
                size={140}
              />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold ui-title">
                {item.articleNom}
              </h1>
              <p className="ui-text-muted">
                {[item.brand, item.articleModele].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {item.category && (
                <Badge tone="neutral">
                  {t(`articleCategory.${item.category as ArticleCategory}`)}
                </Badge>
              )}
              {item.warrantyActive === true && (
                <Badge
                  tone="success"
                  icon={<ShieldCheck className="h-3 w-3" />}
                >
                  {t("publicItem.warrantyActive")}
                </Badge>
              )}
              {item.warrantyActive === false && (
                <Badge tone="neutral" icon={<ShieldX className="h-3 w-3" />}>
                  {t("publicItem.warrantyExpired")}
                </Badge>
              )}
            </div>

            {item.articleDescription && (
              <p className="whitespace-pre-line break-words text-center text-sm">
                {item.articleDescription}
              </p>
            )}
          </div>
        )}
      </main>
      <p className="mt-4 text-xs ui-text-muted">{t("publicItem.footer")}</p>
    </div>
  );
}
