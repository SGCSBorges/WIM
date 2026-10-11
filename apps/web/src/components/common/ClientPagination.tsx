/**
 * Prev/next under a list paged on the client (useClientPage). Moving to
 * another page brings the list's top back into view: the buttons sit at the
 * bottom of a long list, and the new rows start above the fold.
 */
import type { RefObject } from "react";
import { Pagination } from "../ui";
import { useI18n } from "../../i18n/i18n";
import { formatCount } from "../../utils/number";
import type { ClientPage } from "../../hooks/useClientPage";

export function ClientPagination<T>({
  paged,
  listTop,
  className = "mt-4",
}: {
  paged: ClientPage<T>;
  listTop?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { t, language } = useI18n();
  return (
    <Pagination
      className={className}
      page={paged.page}
      limit={paged.limit}
      total={paged.total}
      onPage={(p) => {
        paged.setPage(p);
        listTop?.current?.scrollIntoView?.({ block: "start" });
      }}
      prevLabel={t("common.prev")}
      nextLabel={t("common.next")}
      rangeLabel={t("common.pageRange")
        .replace("{from}", formatCount(paged.from, language))
        .replace("{to}", formatCount(paged.to, language))
        .replace("{total}", formatCount(paged.total, language))}
    />
  );
}
