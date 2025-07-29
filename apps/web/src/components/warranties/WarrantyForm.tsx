import React, { useState } from "react";
import { useI18n } from "../../i18n/i18n";

interface Warranty {
  garantieId?: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieArticleId: number;
}

interface WarrantyFormProps {
  warranty?: Warranty;
  articleId?: number;
  onSubmit: (warrantyData: Omit<Warranty, "garantieId">) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const WarrantyForm: React.FC<WarrantyFormProps> = ({
  warranty,
  articleId,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState<Omit<Warranty, "garantieId">>({
    garantieNom: warranty?.garantieNom || "",
    garantieDateAchat:
      warranty?.garantieDateAchat || new Date().toISOString().split("T")[0],
    garantieDuration: warranty?.garantieDuration || 12,
    garantieArticleId: warranty?.garantieArticleId || articleId || 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.garantieNom.trim()) {
      newErrors.garantieNom = t("warrantyForm.error.nameRequired");
    } else if (formData.garantieNom.length > 100) {
      newErrors.garantieNom = t("warrantyForm.error.nameMax");
    }

    if (!formData.garantieDateAchat) {
      newErrors.garantieDateAchat = t(
        "warrantyForm.error.purchaseDateRequired",
      );
    }

    if (!formData.garantieDuration || formData.garantieDuration < 1) {
      newErrors.garantieDuration = t("warrantyForm.error.durationMin");
    } else if (formData.garantieDuration > 120) {
      newErrors.garantieDuration = t("warrantyForm.error.durationMax");
    }

    if (!formData.garantieArticleId) {
      newErrors.garantieArticleId = t("warrantyForm.error.articleRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleInputChange = (
    field: keyof typeof formData,
    value: string | number,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  // Calculate warranty end date
  const calculateEndDate = () => {
    if (formData.garantieDateAchat && formData.garantieDuration) {
      const purchaseDate = new Date(formData.garantieDateAchat);
      const endDate = new Date(purchaseDate);
      endDate.setMonth(endDate.getMonth() + formData.garantieDuration);
      return endDate.toLocaleDateString();
    }
    return "";
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        {warranty ? t("warrantyForm.editTitle") : t("warrantyForm.addTitle")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Warranty Name */}
        <div>
          <label
            htmlFor="garantieNom"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("warrantyForm.name")} *
          </label>
          <input
            type="text"
            id="garantieNom"
            value={formData.garantieNom}
            onChange={(e) => handleInputChange("garantieNom", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("warrantyForm.name.placeholder")}
            maxLength={100}
            disabled={isLoading}
          />
          {errors.garantieNom && (
            <p className="mt-1 text-sm text-red-600">{errors.garantieNom}</p>
          )}
        </div>

        {/* Purchase Date */}
        <div>
          <label
            htmlFor="garantieDateAchat"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("warrantyForm.purchaseDate")} *
          </label>
          <input
            type="date"
            id="garantieDateAchat"
            value={formData.garantieDateAchat}
            onChange={(e) =>
              handleInputChange("garantieDateAchat", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          {errors.garantieDateAchat && (
            <p className="mt-1 text-sm text-red-600">
              {errors.garantieDateAchat}
            </p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label
            htmlFor="garantieDuration"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("warrantyForm.durationMonths")} *
          </label>
          <input
            type="number"
            id="garantieDuration"
            value={formData.garantieDuration}
            onChange={(e) =>
              handleInputChange(
                "garantieDuration",
                parseInt(e.target.value) || 0,
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("warrantyForm.duration.placeholder")}
            min={1}
            max={120}
            disabled={isLoading}
          />
          {errors.garantieDuration && (
            <p className="mt-1 text-sm text-red-600">
              {errors.garantieDuration}
            </p>
          )}
        </div>

        {/* Warranty End Date Display */}
        {formData.garantieDateAchat && formData.garantieDuration && (
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>{t("warrantyForm.expiresOn")}</strong>{" "}
              {calculateEndDate()}
            </p>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading
              ? t("warrantyForm.saving")
              : warranty
                ? t("warrantyForm.update")
                : t("warrantyForm.create")}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default WarrantyForm;
