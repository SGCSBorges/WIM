import React, { useState } from "react";
import { WarrantyCreateRequest, ArticleWithWarranties } from "../../types";
import { apiClient } from "../../services/api";
import { format, addMonths, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface WarrantyFormProps {
  article: ArticleWithWarranties;
  onSave: () => void;
  onCancel: () => void;
}

export function WarrantyForm({ article, onSave, onCancel }: WarrantyFormProps) {
  const [formData, setFormData] = useState({
    garantieNom: `Garantie ${article.articleNom}`,
    garantieDateAchat: format(new Date(), "yyyy-MM-dd"),
    garantieDuration: 24, // 2 years default
    garantieImage: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Calculate warranty end date
  const warrantyEndDate = addMonths(
    parseISO(formData.garantieDateAchat),
    formData.garantieDuration,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const warrantyData: WarrantyCreateRequest = {
        ...formData,
        garantieArticleId: article.articleId,
      };

      await apiClient.createWarranty(warrantyData);
      onSave();
    } catch (err: any) {
      setError(err.error || "Erreur lors de la création de la garantie");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === "garantieDuration") {
      setFormData({
        ...formData,
        [name]: parseInt(value) || 0,
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Ajouter une garantie
          </h3>

          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900">Article concerné :</h4>
            <p className="text-blue-700">
              {article.articleNom} - {article.articleModele}
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="garantieNom"
                className="block text-sm font-medium text-gray-700"
              >
                Nom de la garantie *
              </label>
              <input
                type="text"
                id="garantieNom"
                name="garantieNom"
                required
                value={formData.garantieNom}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ex: Garantie Apple Care"
              />
            </div>

            <div>
              <label
                htmlFor="garantieDateAchat"
                className="block text-sm font-medium text-gray-700"
              >
                Date d'achat *
              </label>
              <input
                type="date"
                id="garantieDateAchat"
                name="garantieDateAchat"
                required
                value={formData.garantieDateAchat}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label
                htmlFor="garantieDuration"
                className="block text-sm font-medium text-gray-700"
              >
                Durée de la garantie (en mois) *
              </label>
              <select
                id="garantieDuration"
                name="garantieDuration"
                required
                value={formData.garantieDuration}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value={6}>6 mois</option>
                <option value={12}>1 an</option>
                <option value={24}>2 ans</option>
                <option value={36}>3 ans</option>
                <option value={60}>5 ans</option>
              </select>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-sm">
                <span className="font-medium text-gray-700">
                  Date de fin de garantie :
                </span>
                <br />
                <span className="text-indigo-600 font-medium">
                  {format(warrantyEndDate, "dd MMMM yyyy", { locale: fr })}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="garantieImage"
                className="block text-sm font-medium text-gray-700"
              >
                URL de l'image (optionnel)
              </label>
              <input
                type="url"
                id="garantieImage"
                name="garantieImage"
                value={formData.garantieImage}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="https://exemple.com/image.jpg"
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
                {loading ? "Création..." : "Créer la garantie"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
