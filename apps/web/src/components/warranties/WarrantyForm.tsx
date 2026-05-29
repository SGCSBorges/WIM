import React, { useState } from "react";
import { format } from "date-fns";
import { useI18n } from "../../i18n/i18n";

interface Warranty {
  garantieId?: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieArticleId: number;
  providerName?: string | null;
  providerPhone?: string | null;
  providerUrl?: string | null;
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
    providerName: warranty?.providerName ?? "",
    providerPhone: warranty?.providerPhone ?? "",
    providerUrl: warranty?.providerUrl ?? "",
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
        "warrantyForm.error.purchaseDateRequired"
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
      onSubmit({
        ...formData,
        providerName: formData.providerName?.trim() || null,
        providerPhone: formData.providerPhone?.trim() || null,
        providerUrl: formData.providerUrl?.trim() || null,
      });
    }
  };

  const handleInputChange = (
    field: keyof typeof formData,
    value: string | number
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
      return format(endDate, "dd MMM yyyy");
    }
    return "";
  };

  return (
    <div className="ui-card max-w-2xl mx-auto p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-6">
        {warranty ? t("warrantyForm.editTitle") : t("warrantyForm.addTitle")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Warranty Name */}
        <div>
          <label
            htmlFor="garantieNom"
            className="block text-sm font-medium mb-2"
          >
            {t("warrantyForm.name")} *
          </label>
          <input
            type="text"
            id="garantieNom"
            value={formData.garantieNom}
            onChange={(e) => handleInputChange("garantieNom", e.target.value)}
            className="ui-input w-full px-3 py-2 rounded-md"
            placeholder={t("warrantyForm.name.placeholder")}
            maxLength={100}
            disabled={isLoading}
          />
          {errors.garantieNom && (
            <p className="mt-1 text-sm ui-text-error">{errors.garantieNom}</p>
          )}
        </div>

        {/* Purchase Date */}
        <div>
          <label
            htmlFor="garantieDateAchat"
            className="block text-sm font-medium mb-2"
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
            className="ui-input w-full px-3 py-2 rounded-md"
            disabled={isLoading}
          />
          {errors.garantieDateAchat && (
            <p className="mt-1 text-sm ui-text-error">
              {errors.garantieDateAchat}
            </p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label
            htmlFor="garantieDuration"
            className="block text-sm font-medium mb-2"
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
                parseInt(e.target.value) || 0
              )
            }
            className="ui-input w-full px-3 py-2 rounded-md"
            placeholder={t("warrantyForm.duration.placeholder")}
            min={1}
            max={120}
            disabled={isLoading}
          />
          {errors.garantieDuration && (
            <p className="mt-1 text-sm ui-text-error">
              {errors.garantieDuration}
            </p>
          )}
        </div>

        {/* Warranty End Date Display */}
        {formData.garantieDateAchat && formData.garantieDuration && (
          <div className="ui-panel p-3 rounded-md">
            <p className="text-sm">
              <strong>{t("warrantyForm.expiresOn")}</strong>{" "}
              {calculateEndDate()}
            </p>
          </div>
        )}

        <fieldset className="border-t ui-divider pt-4 space-y-3">
          <legend className="text-sm font-medium ui-text-muted px-1">
            {t("warrantyForm.provider")}
          </legend>
          <div>
            <label
              htmlFor="providerName"
              className="block text-sm font-medium mb-2"
            >
              {t("warrantyForm.providerName")}
            </label>
            <input
              type="text"
              id="providerName"
              value={formData.providerName ?? ""}
              onChange={(e) =>
                handleInputChange("providerName", e.target.value)
              }
              className="ui-input w-full px-3 py-2 rounded-md"
              maxLength={120}
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="providerPhone"
                className="block text-sm font-medium mb-2"
              >
                {t("warrantyForm.providerPhone")}
              </label>
              <input
                type="tel"
                id="providerPhone"
                value={formData.providerPhone ?? ""}
                onChange={(e) =>
                  handleInputChange("providerPhone", e.target.value)
                }
                className="ui-input w-full px-3 py-2 rounded-md"
                maxLength={40}
                disabled={isLoading}
              />
            </div>
            <div>
              <label
                htmlFor="providerUrl"
                className="block text-sm font-medium mb-2"
              >
                {t("warrantyForm.providerUrl")}
              </label>
              <input
                type="url"
                id="providerUrl"
                value={formData.providerUrl ?? ""}
                onChange={(e) =>
                  handleInputChange("providerUrl", e.target.value)
                }
                placeholder="https://"
                className="ui-input w-full px-3 py-2 rounded-md"
                maxLength={2048}
                disabled={isLoading}
              />
            </div>
          </div>
        </fieldset>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-4 border-t ui-divider">
          <button
            type="submit"
            disabled={isLoading}
            className="ui-btn-primary px-6 py-2 rounded-md"
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
              className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider"
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
