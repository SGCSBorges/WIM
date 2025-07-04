import React, { useState, useEffect } from "react";
import { ArticleWithWarranties } from "../../types";
import { apiClient } from "../../services/api";
import { ArticleForm } from "./ArticleForm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export function ArticlesList() {
  const [articles, setArticles] = useState<ArticleWithWarranties[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<
    ArticleWithWarranties | undefined
  >();

  const loadArticles = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getArticles();
      setArticles(response);
      setError("");
    } catch (err: any) {
      setError(err.error || "Erreur lors du chargement des articles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const handleCreateArticle = () => {
    setEditingArticle(undefined);
    setShowForm(true);
  };

  const handleEditArticle = (article: ArticleWithWarranties) => {
    setEditingArticle(article);
    setShowForm(true);
  };

  const handleDeleteArticle = async (articleId: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet article ?")) {
      return;
    }

    try {
      await apiClient.deleteArticle(articleId);
      setArticles(articles.filter((a) => a.articleId !== articleId));
    } catch (err: any) {
      setError(err.error || "Erreur lors de la suppression");
    }
  };

  const handleSaveArticle = (savedArticle: ArticleWithWarranties) => {
    if (editingArticle) {
      // Update existing article
      setArticles(
        articles.map((a) =>
          a.articleId === savedArticle.articleId ? savedArticle : a,
        ),
      );
    } else {
      // Add new article
      setArticles([savedArticle, ...articles]);
    }
    setShowForm(false);
    setEditingArticle(undefined);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingArticle(undefined);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Chargement des articles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Articles</h1>
          <p className="mt-2 text-sm text-gray-700">
            Gérez votre inventaire d'articles et leurs garanties.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={handleCreateArticle}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
          >
            Ajouter un article
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {articles.length === 0 ? (
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
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Aucun article
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Commencez par ajouter votre premier article à l'inventaire.
                </p>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleCreateArticle}
                    className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Ajouter un article
                  </button>
                </div>
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
                        Modèle
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Garantie
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {articles.map((article) => (
                      <tr key={article.articleId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {article.articleNom}
                              </div>
                              {article.articleDescription && (
                                <div className="text-sm text-gray-500">
                                  {article.articleDescription}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {article.articleModele}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {article.garantie ? (
                            <div className="text-sm">
                              <div className="text-gray-900 font-medium">
                                {article.garantie.garantieNom}
                              </div>
                              <div className="text-gray-500">
                                Expire le{" "}
                                {format(
                                  new Date(article.garantie.garantieDateFin),
                                  "dd MMMM yyyy",
                                  { locale: fr },
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Aucune garantie
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleEditArticle(article)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteArticle(article.articleId)
                              }
                              className="text-red-600 hover:text-red-900"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <ArticleForm
          article={editingArticle}
          onSave={handleSaveArticle}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
}
