/**
 * AppShell — the authenticated chrome: skip link, desktop Sidebar, sticky
 * TopBar, mobile drawer, and the scrollable content area. Owns only layout
 * state (mobile drawer open, sidebar collapsed — the latter persisted) plus
 * the command palette + shortcuts overlay, so they're available on every
 * route. Auth, routing, and Stripe-return handling stay in App.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Keyboard, Package, Palette, Plus, Rows3 } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { useTheme, type Theme } from "../../theme/theme";
import { usePreferences } from "../../preferences/preferences";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useFeature, useFeatures } from "../../features/features";
import { articlesAPI } from "../../services/api";
import { visibleNavItems, type NavItem, type NavKey } from "../../lib/navItems";
import OfflineBanner from "../common/OfflineBanner";
import BackToTop from "../common/BackToTop";
import ShortcutsHelp from "../common/ShortcutsHelp";
import { CommandPalette, type CommandItem } from "../ui";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileDrawer from "./MobileDrawer";

const COLLAPSE_KEY = "wim.sidebar.collapsed";
const THEMES: Theme[] = ["light", "dark", "ocean", "cyber", "sunset"];

export interface AppShellProps {
  role: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppShell({ role, onLogout, children }: AppShellProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = usePreferences();
  const canUsePalette = useFeature("cmd_palette");
  const { features } = useFeatures();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === "1"
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });

  const navItems = useMemo(() => visibleNavItems(role, features), [role, features]);

  // First-letter prefix → nav target. We resolve at hotkey time so two-key
  // sequences (`g a`, `g d`…) jump to whichever item matches the second key.
  const goByLetter = useCallback(
    (letter: string) => {
      const item = navItems.find((n) => n.key[0] === letter);
      if (item) navigate(item.path);
    },
    [navItems, navigate]
  );

  // Global keyboard shortcuts. `useHotkeys` ignores plain keys while typing
  // and only honors modifier combos while inputs have focus, so ⌘K is always
  // available but `c`/`g d`/etc. stay out of the way.
  const hotkeys = useMemo<Record<string, () => void>>(() => {
    const map: Record<string, () => void> = {
      ...(canUsePalette ? { "mod+k": () => setPaletteOpen(true) } : {}),
      c: () => navigate("/articles?new=1"),
      "?": () => setShortcutsOpen(true),
    };
    for (const item of navItems) {
      map[`g ${item.key[0]}`] = () => goByLetter(item.key[0]);
    }
    return map;
  }, [navItems, navigate, goByLetter]);

  useHotkeys(hotkeys);

  // Article-search backing for the palette. Uses the existing list endpoint
  // with `q` (server-side trigram-indexed); a small limit keeps it snappy.
  const searchArticles = useCallback(
    async (query: string): Promise<CommandItem[]> => {
      const { items } = await articlesAPI.getAll({ q: query, limit: 8 });
      return items.map((a) => ({
        id: `article-${a.articleId}`,
        label: a.articleNom,
        group: t("cmdk.group.articles"),
        hint: a.articleModele || undefined,
        icon: <Package className="h-4 w-4" />,
        perform: () => navigate(`/articles/${a.articleId}`),
      }));
    },
    [navigate, t]
  );

  const navCommands: CommandItem[] = navItems.map((item: NavItem) => ({
    id: `nav-${item.key}`,
    label: t(`nav.${item.key as NavKey}`),
    group: t("cmdk.group.navigate"),
    icon: <item.icon className="h-4 w-4" />,
    perform: () => navigate(item.path),
  }));

  const actionCommands: CommandItem[] = [
    {
      id: "action-new-article",
      label: t("cmdk.action.newArticle"),
      group: t("cmdk.group.actions"),
      hint: "C",
      icon: <Plus className="h-4 w-4" />,
      perform: () => navigate("/articles?new=1"),
    },
    {
      id: "action-shortcuts",
      label: t("cmdk.action.shortcuts"),
      group: t("cmdk.group.actions"),
      hint: "?",
      icon: <Keyboard className="h-4 w-4" />,
      perform: () => setShortcutsOpen(true),
    },
    {
      id: "action-toggle-theme",
      label: t("cmdk.action.toggleTheme"),
      group: t("cmdk.group.appearance"),
      icon: <Palette className="h-4 w-4" />,
      perform: () => {
        const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
        setTheme(next);
      },
    },
    {
      id: "action-toggle-density",
      label: t("cmdk.action.toggleDensity"),
      group: t("cmdk.group.appearance"),
      icon: <Rows3 className="h-4 w-4" />,
      perform: () =>
        setDensity(density === "comfortable" ? "compact" : "comfortable"),
    },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-contrast"
      >
        {t("nav.skipToContent")}
      </a>

      <OfflineBanner />

      <div className="flex">
        <Sidebar
          role={role}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            ref={toggleRef}
            mobileNavOpen={mobileNavOpen}
            onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
            onLogout={onLogout}
            onOpenSearch={() => setPaletteOpen(true)}
            showSearch={canUsePalette}
          />
          <main id="main" className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={role}
        onLogout={onLogout}
        toggleRef={toggleRef}
      />

      {canUsePalette && (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={[...navCommands, ...actionCommands]}
          search={searchArticles}
          placeholder={t("cmdk.placeholder")}
          emptyLabel={t("cmdk.empty")}
        />
      )}
      <ShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        role={role}
      />
      <BackToTop />
    </div>
  );
}
