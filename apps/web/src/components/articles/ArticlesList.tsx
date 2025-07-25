/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect } from "react";
import ArticleForm from "./ArticleForm";
import { articlesAPI, locationsAPI } from "../../services/api";

interface Article {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
    garantieDateAchat?: string;
    garantieDuration?: number;
    garantieImageAttachmentId?: number | null;
  } | null;
  locations?: Array<{
    locationId: number;
    location: { name: string };
  }>;
}

interface Location {
  locationId: number;
  name: string;
}

const ArticlesList: React.FC = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilterId, setLocationFilterId] = useState<number | undefined>(
    undefined,
  );

  // Fetch articles from API
  const fetchArticles = async () => {
    try {
      setLoading(true);
      const data = await articlesAPI.getAll(locationFilterId);
      setArticles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching articles:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const data = await locationsAPI.getAll();
      const mapped: Location[] = (data || []).map((l: any) => ({
        locationId: l.locationId,
        name: l.name,
      }));
      setLocations(mapped);
    } catch {
      // non-blocking
    }
  };

  // Create or update article
  const handleSubmit = async (articleData: Omit<Article, "articleId">) => {
    try {
      if (editingArticle) {
        await articlesAPI.update(editingArticle.articleId, articleData);
      } else {
        await articlesAPI.create(articleData);
      }

      // Refresh articles list
      await fetchArticles();

      // Reset form
      setShowForm(false);
      setEditingArticle(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error submitting article:", err);
    }
  };

  // Delete article
  const handleDelete = async (articleId: number) => {
    if (!confirm("Are you sure you want to delete this article?")) {
      return;
    }

    try {
      await articlesAPI.delete(articleId);
      // Refresh articles list
      await fetchArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error deleting article:", err);
    }
  };

  // Load articles on component mount
  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [locationFilterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
          <p className="text-gray-600">Manage your inventory articles</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              setLocationFilterId(
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Create Article
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-400 mr-2">❌</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {showForm && (
        <ArticleForm
          article={editingArticle || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingArticle(null);
          }}
        />
      )}

      <div className="bg-white rounded-lg shadow">
        {articles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No articles found
            </h3>
            <p className="text-gray-600 mb-4">
              Create your first article to get started
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Article
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Warranty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proof
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {articles.map((article) => (
                  <tr key={article.articleId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {article.articleNom}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {article.articleModele}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {article.articleDescription || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {article.garantie ? (
                        <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {article.garantie?.garantieImageAttachmentId ? (
                        <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingArticle(article);
                          setShowForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(article.articleId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticlesList;
