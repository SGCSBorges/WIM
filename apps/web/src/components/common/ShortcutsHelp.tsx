/**
 * Read-only modal listing the global keyboard shortcuts. Opens from `?` or
 * the command palette. Two-key sequences are rendered as separate `<kbd>`
 * pills so the order is obvious; the prefix is announced via `shortcuts.goPrefix`.
 */
import Modal from "./Modal";
import { useI18n } from "../../i18n/i18n";
import { visibleNavItems } from "../../lib/navItems";

const TITLE_ID = "shortcuts-help-title";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  role: string | null;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-xs ui-title">
      {children}
    </kbd>
  );
}

function modKey(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

export default function ShortcutsHelp({
  open,
  onClose,
  role,
}: ShortcutsHelpProps) {
  const { t } = useI18n();

  const globalRows: { keys: React.ReactNode[]; label: string }[] = [
    {
      keys: [<Kbd key="mod">{modKey()}</Kbd>, <Kbd key="k">K</Kbd>],
      label: t("shortcuts.openPalette"),
    },
    { keys: [<Kbd key="c">C</Kbd>], label: t("shortcuts.newArticle") },
    { keys: [<Kbd key="q">?</Kbd>], label: t("shortcuts.openShortcuts") },
  ];

  const navRows = visibleNavItems(role).map((item) => ({
    keys: [
      <Kbd key="g">G</Kbd>,
      <Kbd key="k">{item.key[0].toUpperCase()}</Kbd>,
    ],
    label: t(`nav.${item.key}`),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={TITLE_ID}
      panelClassName="ui-card w-full max-w-md space-y-4 p-6"
    >
      <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
        {t("shortcuts.title")}
      </h2>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide ui-text-muted">
          {t("shortcuts.global")}
        </h3>
        <ul className="space-y-1.5">
          {globalRows.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="ui-title">{r.label}</span>
              <span className="flex gap-1">{r.keys}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide ui-text-muted">
          {t("shortcuts.navigate")}
        </h3>
        <p className="mb-2 text-xs ui-text-muted">
          {t("shortcuts.goPrefix").replace("{prefix}", "G")}
        </p>
        <ul className="space-y-1.5">
          {navRows.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="ui-title">{r.label}</span>
              <span className="flex gap-1">{r.keys}</span>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
}
