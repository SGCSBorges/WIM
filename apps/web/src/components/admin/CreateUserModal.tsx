import { useState } from "react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import Modal from "../common/Modal";

type Role = "USER" | "POWER_USER" | "ADMIN";

export default function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminAPI.createUser({ email, password, role });
      onCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t("admin.error.createUser")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      titleId="create-user-modal-title"
      panelClassName="ui-card rounded-lg shadow-xl w-full max-w-md"
    >
      <form onSubmit={submit}>
        <div className="p-4 border-b ui-divider flex items-center justify-between">
          <h2 id="create-user-modal-title" className="font-semibold">
            {t("admin.createUser.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-text-muted hover:opacity-70"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label
              htmlFor="cu-email"
              className="block text-sm font-medium mb-1"
            >
              {t("auth.email")}
            </label>
            <input
              id="cu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full ui-input px-3 py-2 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="cu-password"
              className="block text-sm font-medium mb-1"
            >
              {t("auth.password")}
            </label>
            <input
              id="cu-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full ui-input px-3 py-2 rounded-md"
            />
            <p className="text-xs ui-text-muted mt-1">
              {t("admin.password.requirements")}
            </p>
          </div>
          <div>
            <label htmlFor="cu-role" className="block text-sm font-medium mb-1">
              {t("admin.roleLabel")}
            </label>
            <select
              id="cu-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full ui-input px-3 py-2 rounded-md"
            >
              <option value="USER">USER</option>
              <option value="POWER_USER">POWER_USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          {error && (
            <div className="border ui-alert-error rounded-md p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t ui-divider flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm ui-btn-ghost border ui-divider rounded"
            disabled={busy}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="px-3 py-2 text-sm ui-btn-primary rounded"
            disabled={busy}
          >
            {busy ? t("admin.creating") : t("admin.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
