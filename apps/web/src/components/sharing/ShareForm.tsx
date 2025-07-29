import React, { useState } from "react";
import { useI18n } from "../../i18n/i18n";

interface ShareFormProps {
  onSubmit: (shareData: {
    email: string;
    permission: "READ" | "WRITE";
  }) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const ShareForm: React.FC<ShareFormProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    email: "",
    permission: "READ" as "READ" | "WRITE",
  });

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

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        {t("shareForm.title")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Input */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("shareForm.email")} *
          </label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("shareForm.email.placeholder")}
            disabled={isLoading}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        {/* Permission Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t("shareForm.permission")} *
          </label>
          <div className="space-y-3">
            <div className="flex items-start">
              <input
                type="radio"
                id="read"
                name="permission"
                value="READ"
                checked={formData.permission === "READ"}
                onChange={(e) =>
                  handleInputChange("permission", e.target.value)
                }
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isLoading}
              />
              <label htmlFor="read" className="ml-3 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {t("shareForm.permission.read")}
                </span>
                <span className="block text-sm text-gray-500">
                  {t("shareForm.permission.read.help")}
                </span>
              </label>
            </div>

            <div className="flex items-start">
              <input
                type="radio"
                id="write"
                name="permission"
                value="WRITE"
                checked={formData.permission === "WRITE"}
                onChange={(e) =>
                  handleInputChange("permission", e.target.value)
                }
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isLoading}
              />
              <label htmlFor="write" className="ml-3 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {t("shareForm.permission.write")}
                </span>
                <span className="block text-sm text-gray-500">
                  {t("shareForm.permission.write.help")}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-3 bg-blue-50 rounded-md">
          <div className="flex">
            <svg
              className="flex-shrink-0 h-5 w-5 text-blue-400 mt-0.5"
              fill="none"
              viewBox="0 0 20 20"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-blue-800">{t("shareForm.info")}</p>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? t("shareForm.sending") : t("shareForm.send")}
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

export default ShareForm;
