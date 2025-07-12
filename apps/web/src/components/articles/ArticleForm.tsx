/**
 * Article Form Component
 * Form for creating and editing articles
 */

import React, { useState } from "react";

interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string;
  productImageUrl?: string;
}

interface ArticleFormProps {
  article?: Article;
  onSubmit: (article: Omit<Article, "articleId">) => void;
  onCancel?: () => void;
}

const ArticleForm: React.FC<ArticleFormProps> = ({
  article,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<Omit<Article, "articleId">>({
    articleNom: article?.articleNom || "",
    articleModele: article?.articleModele || "",
    articleDescription: article?.articleDescription || "",
    productImageUrl: article?.productImageUrl || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {article ? "Edit Article" : "Create New Article"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="articleNom"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Article Name *
          </label>
          <input
            type="text"
            id="articleNom"
            name="articleNom"
            required
            value={formData.articleNom}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter article name"
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleModele"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Model *
          </label>
          <input
            type="text"
            id="articleModele"
            name="articleModele"
            required
            value={formData.articleModele}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter model"
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleDescription"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <textarea
            id="articleDescription"
            name="articleDescription"
            value={formData.articleDescription}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter description (optional)"
            maxLength={255}
          />
        </div>

        <div>
          <label
            htmlFor="productImageUrl"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Product Image URL
          </label>
          <input
            type="url"
            id="productImageUrl"
            name="productImageUrl"
            value={formData.productImageUrl}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg (optional)"
            maxLength={255}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {article ? "Update Article" : "Create Article"}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ArticleForm;
