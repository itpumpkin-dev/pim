import { filterNavItemsByPermission, flattenNavItems, useMainNavItems } from '@/hooks/use-nav-items';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/badge.js';
import '@ui5/webcomponents-icons/dist/building.js';
import '@ui5/webcomponents-icons/dist/database.js';
import '@ui5/webcomponents-icons/dist/employee.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/role.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import { SearchItem, SearchItemGroup, SearchMessageArea, ShellBarSearch, type ShellBarSearchDomRef } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ObjectKind =
    | 'products'
    | 'categories'
    | 'subcategories'
    | 'productGroups'
    | 'brands'
    | 'baseUnits'
    | 'businessTypes'
    | 'productGrades'
    | 'vendors'
    | 'currencies'
    | 'points'
    | 'commissionGroups'
    | 'attributes'
    | 'attributeGroups'
    | 'attributeFamilies'
    | 'users'
    | 'roles'
    | 'departments'
    | 'jobPositions';

/** Shape returned per group by GlobalSearchController::search(). */
interface ObjectSuggestion {
    id: number;
    label: string;
    sub?: string | null;
    url: string;
}

type ObjectResults = Record<ObjectKind, ObjectSuggestion[]>;

const EMPTY_RESULTS: ObjectResults = {
    products: [],
    categories: [],
    subcategories: [],
    productGroups: [],
    brands: [],
    baseUnits: [],
    businessTypes: [],
    productGrades: [],
    vendors: [],
    currencies: [],
    points: [],
    commissionGroups: [],
    attributes: [],
    attributeGroups: [],
    attributeFamilies: [],
    users: [],
    roles: [],
    departments: [],
    jobPositions: [],
};

// Fixed render order for the object-suggestion groups below the menu group —
// each kind renders as its own SearchItemGroup, in this order.
const OBJECT_KINDS: ObjectKind[] = [
    'products',
    'categories',
    'subcategories',
    'productGroups',
    'brands',
    'baseUnits',
    'businessTypes',
    'productGrades',
    'vendors',
    'currencies',
    'points',
    'commissionGroups',
    'attributes',
    'attributeGroups',
    'attributeFamilies',
    'users',
    'roles',
    'departments',
    'jobPositions',
];

interface MenuOption {
    kind: 'menu';
    key: string;
    title: string;
    url: string;
    /** breadcrumb of group titles above this page, e.g. ["Catalog", "Master"] */
    path: string[];
}

interface ObjectOption extends ObjectSuggestion {
    kind: ObjectKind;
    key: string;
}

type SearchOption = MenuOption | ObjectOption;

const GROUP_ICON: Record<SearchOption['kind'], string> = {
    menu: 'show',
    products: 'product',
    categories: 'database',
    subcategories: 'database',
    productGroups: 'database',
    brands: 'database',
    baseUnits: 'database',
    businessTypes: 'database',
    productGrades: 'database',
    vendors: 'database',
    currencies: 'database',
    points: 'database',
    commissionGroups: 'database',
    attributes: 'tag',
    attributeGroups: 'tag',
    attributeFamilies: 'tag',
    users: 'employee',
    roles: 'role',
    departments: 'building',
    jobPositions: 'badge',
};

interface ShellSearchProps {
    /** Set by the ShellBar `searchField` slot prop — must land on the outermost element. */
    slot?: string;
    /** Called when Ctrl/⌘+K needs the (possibly collapsed) field shown — the ShellBar owns that state. */
    onExpandRequest?: () => void;
}

/**
 * SAP Fiori "Shell Search" — https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/shell-search
 * on the official UI5 `ShellBarSearch`, slotted into the ShellBar's
 * `searchField` slot (app-sidebar-header.tsx). Suggestions split the same way
 * Fiori's spec does: "App suggestions" (jump straight to a menu page —
 * matched client-side against the sidebar's own nav tree, see
 * hooks/use-nav-items.ts) render first, then "Object suggestions" (live
 * records — products/categories/subcategories/product groups/brands/
 * attributes, fetched from GlobalSearchController) follow in their own
 * groups. Each object group only appears for a viewer who holds that
 * resource's `list_*` permission — the backend enforces this itself, this
 * component just renders whatever groups come back.
 *
 * UI5 highlights the typed text inside each suggestion itself, and the
 * ShellBar collapses the field to a magnifier button when the bar is narrow
 * (`onExpandRequest` lets Ctrl+K re-open it).
 */
export function ShellSearch({ slot, onExpandRequest }: ShellSearchProps) {
    const { t } = useTranslation('common');
    const { auth } = usePage<SharedData>().props;

    const mainNavItems = useMainNavItems();
    const flatPages = useMemo(() => flattenNavItems(filterNavItemsByPermission(mainNavItems, auth.permissions)), [mainNavItems, auth.permissions]);

    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [objectResults, setObjectResults] = useState<ObjectResults>(EMPTY_RESULTS);
    const searchRef = useRef<ShellBarSearchDomRef>(null);
    const requestIdRef = useRef(0);

    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

    // Ctrl+K (⌘K on macOS) jumps to the search field from anywhere — on a
    // narrow shell bar it first asks the ShellBar to expand the collapsed
    // magnifier button. Matches on e.code (the physical key) rather than
    // e.key, because with the Thai keyboard layout active the K key reports
    // e.key === 'า' and the browser's own Ctrl+K (address-bar search) would
    // fire instead. Capture phase so a focused widget can't swallow it first.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'KeyK' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            e.preventDefault();
            onExpandRequest?.();
            // give the ShellBar a frame to un-collapse the field before focusing it
            requestAnimationFrame(() => {
                const el = searchRef.current;
                if (!el) return;
                el.focus();
                el.shadowRoot?.querySelector('input')?.select();
            });
        };

        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [onExpandRequest]);

    // Object suggestions come from the server — debounced the same way
    // ProductPicker (resources/js/components/product-picker.tsx) debounces
    // its own search-as-you-type, and gated on the same 2-character floor
    // GlobalSearchController enforces server-side.
    //
    // requestIdRef guards against out-of-order responses: if the query
    // changes again before an in-flight fetch resolves, its response is
    // discarded instead of overwriting the (newer) state with stale results.
    useEffect(() => {
        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setObjectResults(EMPTY_RESULTS);
            setLoading(false);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            fetch(`/search?q=${encodeURIComponent(trimmed)}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : null))
                .then((data: ObjectResults | null) => {
                    if (data && requestIdRef.current === requestId) setObjectResults(data);
                })
                .catch(() => {})
                .finally(() => {
                    if (requestIdRef.current === requestId) setLoading(false);
                });
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    // Menu ("App") suggestions are just an in-memory substring match — no
    // debounce needed, there's no request to wait on.
    const menuOptions: MenuOption[] = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle.length === 0) return [];

        return flatPages
            .filter((page) => page.title.toLowerCase().includes(needle) || page.path.some((seg) => seg.toLowerCase().includes(needle)))
            .slice(0, 5)
            .map((page) => ({ kind: 'menu' as const, key: `menu-${page.url}`, title: page.title, url: page.url, path: page.path }));
    }, [flatPages, query]);

    const groups = useMemo(() => {
        const result: { kind: SearchOption['kind']; options: SearchOption[] }[] = [];
        if (menuOptions.length > 0) result.push({ kind: 'menu', options: menuOptions });
        for (const kind of OBJECT_KINDS) {
            const rows = objectResults[kind] ?? [];
            if (rows.length > 0) {
                result.push({ kind, options: rows.map((item) => ({ ...item, kind, key: `${kind}-${item.id}` })) });
            }
        }
        return result;
    }, [menuOptions, objectResults]);

    const groupLabel = (kind: SearchOption['kind']): string => t(`search${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);

    const navigate = (url: string) => {
        setQuery('');
        router.visit(url);
    };

    const showNoResults = query.trim().length > 0 && !loading && groups.length === 0;

    return (
        <ShellBarSearch
            ref={searchRef}
            slot={slot}
            value={query}
            noTypeahead
            showClearIcon
            fieldLoading={loading}
            placeholder={`${t('search')} (${isMac ? '⌘K' : 'Ctrl+K'})`}
            accessibleName={t('search')}
            onInput={(e) => setQuery(e.target.value)}
            onSearch={(e) => {
                const item = (e.detail as { item?: HTMLElement } | undefined)?.item;
                const url = item?.dataset.url;
                // Enter with nothing picked doesn't navigate (same as the old
                // Autocomplete) — only choosing a suggestion does. Not
                // preventDefault()-ed so UI5 still closes its popup.
                if (url) navigate(url);
            }}
            messageArea={showNoResults ? <SearchMessageArea text={t('noResultsFound')} /> : undefined}
        >
            {groups.map((group) => (
                <SearchItemGroup key={group.kind} headerText={groupLabel(group.kind)}>
                    {group.options.map((option) => (
                        <SearchItem
                            key={option.key}
                            data-url={option.url}
                            icon={GROUP_ICON[option.kind]}
                            text={option.kind === 'menu' ? option.title : option.label}
                            description={(option.kind === 'menu' ? option.path.join(' > ') : option.sub) || undefined}
                        />
                    ))}
                </SearchItemGroup>
            ))}
        </ShellBarSearch>
    );
}
