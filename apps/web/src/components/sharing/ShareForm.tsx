/**
 * Owner-side "Invite someone to view/edit my inventory" form. POWER_USER
 * only. Issues a per-user invite via `sharesAPI.createInvite`; the API
 * returns the same opaque error for "not found" vs "not POWER_USER" to
 * prevent email enumeration. Permission is READ or WRITE.
 */
import React, { useState } from "react";
import { Send, Info } from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { isValidEmail } from "../../utils/validation";
import { Button, Field, Input } from "../ui";

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
    } else if (!isValidEmail(formData.email)) {
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
    <div className="ui-card mx-auto max-w-md p-6 animate-scale-in">
      <h2 className="mb-6 text-xl font-bold ui-title">
        {t("shareForm.title")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label={t("shareForm.email")} required error={errors.email}>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange("email", e.target.value)}
            placeholder={t("shareForm.email.placeholder")}
            disabled={isLoading}
            autoComplete="email"
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium ui-title">
            {t("shareForm.permission")}
            <span className="text-danger" aria-hidden="true">
              {" "}
              *
            </span>
          </legend>
          <div className="space-y-2">
            {(["READ", "WRITE"] as const).map((perm) => {
              const selected = formData.permission === perm;
              return (
                <label
                  key={perm}
                  htmlFor={perm.toLowerCase()}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-line hover:bg-surface-muted"
                  }`}
                >
                  <input
                    type="radio"
                    id={perm.toLowerCase()}
                    name="permission"
                    value={perm}
                    checked={selected}
                    onChange={(e) =>
                      handleInputChange("permission", e.target.value)
                    }
                    className="mt-1 h-4 w-4 accent-[var(--primary)]"
                    disabled={isLoading}
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium ui-title">
                      {t(
                        `shareForm.permission.${perm.toLowerCase()}` as TranslationKey
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm ui-text-muted">
                      {t(
                        `shareForm.permission.${perm.toLowerCase()}.help` as TranslationKey
                      )}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-start gap-2 rounded-lg border ui-alert-info p-3 text-sm">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span>{t("shareForm.info")}</span>
        </div>

        <div className="flex justify-end gap-2 border-t ui-divider pt-4">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
              {t("common.cancel")}
            </Button>
          )}
          <Button
            type="submit"
            loading={isLoading}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {t("shareForm.send")}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ShareForm;
