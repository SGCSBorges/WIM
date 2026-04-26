import React, { useState } from "react";
import { useI18n } from "../../i18n/i18n";
import type { TranslationKey } from "../../i18n/translations";

interface ShareFormProps {
  onSubmit: (shareData: { email: string; permission: "READ" | "WRITE" }) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const ShareForm: React.FC<ShareFormProps> = ({ onSubmit, onCancel, isLoading = false }) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState({ email: "", permission: "READ" as "READ" | "WRITE" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.email.trim()) {
      newErrors.email = t("shareForm.error.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t("shareForm.error.emailInvalid");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) onSubmit(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  return (
    <div className="max-w-md mx-auto p-6 ui-card rounded-lg shadow-md">
      <h2 className="text-2xl font-bold ui-title mb-6">{t("shareForm.title")}</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">
            {t("shareForm.email")} *
          </label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            className="w-full ui-input px-3 py-2 rounded-md"
            placeholder={t("shareForm.email.placeholder")}
            disabled={isLoading}
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-3">{t("shareForm.permission")} *</label>
          <div className="space-y-3">
            {(["READ", "WRITE"] as const).map((perm) => (
              <div key={perm} className="flex items-start">
                <input
                  type="radio"
                  id={perm.toLowerCase()}
                  name="permission"
                  value={perm}
                  checked={formData.permission === perm}
                  onChange={(e) => handleInputChange("permission", e.target.value)}
                  className="mt-1 h-4 w-4"
                  disabled={isLoading}
                />
                <label htmlFor={perm.toLowerCase()} className="ml-3 flex-1">
                  <span className="block text-sm font-medium">
                    {t(`shareForm.permission.${perm.toLowerCase()}` as TranslationKey)}
                  </span>
                  <span className="block text-sm ui-text-muted">
                    {t(`shareForm.permission.${perm.toLowerCase()}.help` as TranslationKey)}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 ui-panel rounded-md">
          <p className="text-sm">{t("shareForm.info")}</p>
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t ui-divider">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 ui-btn-primary rounded-md"
          >
            {isLoading ? t("shareForm.sending") : t("shareForm.send")}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ShareForm;
