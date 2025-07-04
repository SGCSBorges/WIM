import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { ArticleWithWarranties, ArticleCreateRequest } from "../../types";
import { apiClient } from "../../services/api";

interface ArticleFormProps {
  article?: ArticleWithWarranties;
  onSave: (article: ArticleWithWarranties) => void;
  onCancel: () => void;
}

export function ArticleForm({ article, onSave, onCancel }: ArticleFormProps) {
  const [formData, setFormData] = useState({
    articleNom: article?.articleNom || "",
    articleModele: article?.articleModele || "",
    articleDescription: article?.articleDescription || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let savedArticle: ArticleWithWarranties;

      if (article) {
        // Update existing article
        savedArticle = await apiClient.updateArticle(
          article.articleId,
          formData,
        );
      } else {
        // Create new article
        savedArticle = await apiClient.createArticle(
          formData as ArticleCreateRequest,
        );
      }

      onSave(savedArticle);
    } catch (err: any) {
      setError(err.error || "Erreur lors de la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {article ? "Modifier l'article" : "Nouvel article"}
          </h3>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="articleNom"
                className="block text-sm font-medium text-gray-700"
              >
                Nom de l'article *
              </label>
              <input
                type="text"
                id="articleNom"
                name="articleNom"
                required
                value={formData.articleNom}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ex: iPhone 15 Pro"
              />
            </div>

            <div>
              <label
                htmlFor="articleModele"
                className="block text-sm font-medium text-gray-700"
              >
                Modèle *
              </label>
              <input
                type="text"
                id="articleModele"
                name="articleModele"
                required
                value={formData.articleModele}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ex: A3108"
              />
            </div>

            <div>
              <label
                htmlFor="articleDescription"
                className="block text-sm font-medium text-gray-700"
              >
                Description
              </label>
              <textarea
                id="articleDescription"
                name="articleDescription"
                rows={3}
                value={formData.articleDescription}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Description optionnelle de l'article"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? "Sauvegarde..." : article ? "Modifier" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
