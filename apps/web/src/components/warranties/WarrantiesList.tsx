import React, { useState, useEffect } from "react";
import { Warranty, ArticleWithWarranties } from "../../types";
import { apiClient } from "../../services/api";
import { WarrantyForm } from "./WarrantyForm";
import { format, isAfter, isBefore, addDays } from "date-fns";
import { fr } from "date-fns/locale";

export function WarrantiesList() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [articles, setArticles] = useState<ArticleWithWarranties[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<
    ArticleWithWarranties | undefined
  >();

  const loadWarranties = async () => {
    try {
      setLoading(true);
      const [warrantiesData, articlesData] = await Promise.all([
        apiClient.getWarranties(),
        apiClient.getArticles(),
      ]);
      setWarranties(warrantiesData);
      setArticles(articlesData);
      setError("");
    } catch (err: any) {
      setError(err.error || "Erreur lors du chargement des garanties");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarranties();
  }, []);

  const handleAddWarranty = (article: ArticleWithWarranties) => {
    setSelectedArticle(article);
    setShowForm(true);
  };

  const handleSaveWarranty = () => {
    setShowForm(false);
    setSelectedArticle(undefined);
    loadWarranties(); // Reload data
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setSelectedArticle(undefined);
  };

  const handleDeleteWarranty = async (warrantyId: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette garantie ?")) {
      return;
    }

    try {
      await apiClient.deleteWarranty(warrantyId);
      setWarranties(warranties.filter((w) => w.garantieId !== warrantyId));
    } catch (err: any) {
      setError(err.error || "Erreur lors de la suppression");
    }
  };

  const getWarrantyStatus = (warranty: Warranty) => {
    const now = new Date();
    const endDate = new Date(warranty.garantieFin);
    const thirtyDaysFromNow = addDays(now, 30);

    if (isBefore(endDate, now)) {
      return {
        status: "expired",
        label: "Expirée",
        color: "bg-red-100 text-red-800",
      };
    }
    if (isBefore(endDate, thirtyDaysFromNow)) {
      return {
        status: "expiring",
        label: "Expire bientôt",
        color: "bg-yellow-100 text-yellow-800",
      };
    }
    return {
      status: "active",
      label: "Active",
      color: "bg-green-100 text-green-800",
    };
  };

  const articlesWithoutWarranty = articles.filter(
    (article) => !article.garantie,
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Chargement des garanties...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Garanties</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gérez les garanties de vos articles et suivez leurs dates
            d'expiration.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Articles without warranty */}
      {articlesWithoutWarranty.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Articles sans garantie
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="space-y-2">
              {articlesWithoutWarranty.map((article) => (
                <div
                  key={article.articleId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {article.articleNom}
                    </span>
                    <span className="text-gray-500 ml-2">
                      ({article.articleModele})
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddWarranty(article)}
                    className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                  >
                    Ajouter une garantie
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Warranties list */}
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {warranties.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Aucune garantie
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Commencez par ajouter des garanties à vos articles.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Article
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Garantie
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Date d'achat
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Date d'expiration
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Statut
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {warranties.map((warranty) => {
                      const article = articles.find(
                        (a) => a.articleId === warranty.garantieArticleId,
                      );
                      const status = getWarrantyStatus(warranty);

                      return (
                        <tr
                          key={warranty.garantieId}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {article?.articleNom || "Article inconnu"}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {article?.articleModele}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {warranty.garantieNom}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(
                              new Date(warranty.garantieDateAchat),
                              "dd/MM/yyyy",
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(
                              new Date(warranty.garantieFin),
                              "dd/MM/yyyy",
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() =>
                                handleDeleteWarranty(warranty.garantieId)
                              }
                              className="text-red-600 hover:text-red-900"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && selectedArticle && (
        <WarrantyForm
          article={selectedArticle}
          onSave={handleSaveWarranty}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
}
