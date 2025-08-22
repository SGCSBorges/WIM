import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type SharedOwner = { userId: number; email: string };

type SharedArticle = {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  createdAt: string;
  updatedAt: string;
  garantie?: any;
  locations?: any[];
  ownerUserId: number;
};

type SharedArticleRow = {
  articleShareId: number;
  owner: SharedOwner;
  article: SharedArticle;
  createdAt: string;
  updatedAt: string;
};

type OwnerShareInfo = {
  articleShareId: number;
  targetUserId: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: { userId: number; email: string; role: string };
};

export default function SharedArticlesView() {
  const { t } = useI18n();
  const [rows, setRows] = useState<SharedArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyShareId, setBusyShareId] = useState<number | null>(null);

  const [ownerSharesByArticleId, setOwnerSharesByArticleId] = useState<
    Record<number, OwnerShareInfo[]>
  >({});
  const [sharesLoadingArticleId, setSharesLoadingArticleId] = useState<
    number | null
  >(null);

  const myUserId = useMemo(() => {
    const raw = localStorage.getItem("userId");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, []);

  const token = localStorage.getItem("token");

  const loadOwnerShares = async (articleId: number) => {
    setSharesLoadingArticleId(articleId);
    try {
      const res = await fetch(`${API_BASE_URL}/articles/${articleId}/shares`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load shares (${res.status})`);
      }
      const data = (await res.json()) as OwnerShareInfo[];
      setOwnerSharesByArticleId((prev) => ({ ...prev, [articleId]: data }));
    } catch (e: any) {
      alert(e?.message || "Failed to load shares");
    } finally {
      setSharesLoadingArticleId(null);
    }
  };

  const unshare = async (
    articleId: number,
    rowId: number,
    targetUserId: number,
  ) => {
    if (!confirm("Unshare this article from that user?")) {
      return;
    }

    setBusyShareId(rowId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/articles/${articleId}/share/${targetUserId}`,
        {
          method: "DELETE",
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Unshare failed (${res.status})`);
      }

      await loadOwnerShares(articleId);
      await fetchRows();
    } catch (e: any) {
      alert(e?.message || "Unshare failed");
    } finally {
      setBusyShareId(null);
    }
  };

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/shared/articles`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to fetch (${res.status})`);
      }
      setRows((await res.json()) as SharedArticleRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load shared articles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="ui-card rounded-lg p-6">
        <div className="text-sm ui-text-muted">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shared articles</h1>
          <p className="text-sm ui-text-muted">
            Read-only. Only the owner can edit or unshare.
          </p>
        </div>
        <button
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
          onClick={fetchRows}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ui-card rounded-lg p-6">
          <p className="text-sm ui-text-muted">No shared articles.</p>
        </div>
      ) : (
        <div className="ui-card rounded-lg">
          <div className="divide-y">
            {rows.map((r) => {
              const isOwner =
                myUserId != null && r.article.ownerUserId === myUserId;
              const ownerShares = ownerSharesByArticleId[r.article.articleId];
              const myShare = ownerShares?.find(
                (s) => s.targetUserId === myUserId,
              );
              return (
                <div key={r.articleShareId} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {r.article.articleNom} — {r.article.articleModele}
                      </div>
                      <div className="text-xs ui-text-muted">
                        Owner: {r.owner.email}
                      </div>
                      {r.article.articleDescription && (
                        <div className="text-sm mt-2 ui-text-muted">
                          {r.article.articleDescription}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                        disabled={!isOwner}
                        title={
                          isOwner
                            ? "Owner-only (handled elsewhere)"
                            : "Only the owner can edit"
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                        disabled={!isOwner}
                        onClick={async () => {
                          if (!isOwner) return;
                          if (!ownerShares) {
                            await loadOwnerShares(r.article.articleId);
                            return;
                          }
                          const targetUserId =
                            myShare?.targetUserId ?? myUserId;
                          if (!targetUserId) {
                            alert("Missing target user id");
                            return;
                          }
                          await unshare(
                            r.article.articleId,
                            r.articleShareId,
                            targetUserId,
                          );
                        }}
                        title={
                          isOwner
                            ? ownerShares
                              ? "Unshare from the selected user"
                              : "Load shares for this article"
                            : "Only the owner can unshare"
                        }
                      >
                        {busyShareId === r.articleShareId ||
                        sharesLoadingArticleId === r.article.articleId
                          ? t("common.loading")
                          : ownerShares
                            ? "Unshare me"
                            : "Load shares"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
