/**
 * Small picker + "save as template" bar shown above the article create form.
 * Owns the template list state + the save dialog so the parent form doesn't
 * have to thread template plumbing through its already-large state surface.
 */
import { useEffect, useState } from "react";
import { BookmarkPlus, Trash2 } from "lucide-react";
import {
  articleTemplatesAPI,
  type ArticleTemplate,
  type ArticleTemplatePayload,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import Modal from "../common/Modal";
import { Button, Field, Input, Select } from "../ui";

interface TemplateBarProps {
  /** Called by the bar to snapshot the form's current state at save time. */
  getCurrentPayload: () => ArticleTemplatePayload;
  /** Called when the user picks a template; the form merges the payload. */
  onApply: (payload: ArticleTemplatePayload) => void;
}

const TITLE_ID = "save-template-dialog";

export default function TemplateBar({
  getCurrentPayload,
  onApply,
}: TemplateBarProps) {
  const { t } = useI18n();
  const toast = useToast();

  const [templates, setTemplates] = useState<ArticleTemplate[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void articleTemplatesAPI
      .list()
      .then((items) => {
        if (!cancelled) setTemplates(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide the bar if the endpoint isn't available (older backend).
  if (failed) return null;

  const apply = (id: string) => {
    setPicked(id);
    if (!id || !templates) return;
    const tpl = templates.find((t) => String(t.id) === id);
    if (tpl) onApply(tpl.payload);
  };

  const saveTemplate = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const payload = getCurrentPayload();
      const created = await articleTemplatesAPI.create(name, payload);
      setTemplates((prev) => (prev ? [created, ...prev] : [created]));
      setSaveName("");
      setSaveOpen(false);
      toast.show(t("template.saved"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async () => {
    if (!picked || !templates || deleting) return;
    setDeleting(true);
    try {
      await articleTemplatesAPI.remove(Number(picked));
      setTemplates((prev) =>
        prev ? prev.filter((t) => String(t.id) !== picked) : prev
      );
      setPicked("");
      toast.show(t("template.deleted"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border ui-divider bg-surface-muted p-3">
      <Field label={t("template.pickLabel")} htmlFor="template-picker">
        <Select
          id="template-picker"
          value={picked}
          onChange={(e) => apply(e.target.value)}
          className="min-w-[14rem]"
        >
          <option value="">{t("template.pickPlaceholder")}</option>
          {(templates ?? []).map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </Select>
      </Field>
      {picked && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={removeTemplate}
          loading={deleting}
          disabled={deleting}
        >
          {t("common.delete")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        leftIcon={<BookmarkPlus className="h-4 w-4" />}
        onClick={() => setSaveOpen(true)}
      >
        {t("template.save")}
      </Button>

      <Modal
        open={saveOpen}
        onClose={() => {
          setSaveName("");
          setSaveOpen(false);
        }}
        titleId={TITLE_ID}
        panelClassName="ui-card w-full max-w-md space-y-4 p-5"
      >
        <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
          {t("template.saveTitle")}
        </h2>
        <p className="text-sm ui-text-muted">{t("template.saveHint")}</p>
        <Field label={t("template.nameLabel")} htmlFor="template-save-name">
          <Input
            id="template-save-name"
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t("template.namePlaceholder")}
            maxLength={120}
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSaveName("");
              setSaveOpen(false);
            }}
            disabled={saving}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!saveName.trim()}
            onClick={saveTemplate}
          >
            {t("template.saveConfirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
