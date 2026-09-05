import { Icon, type IconName } from '@/components/icon';
import { filterNavItemsByPermission, flattenNavItems, useMainNavItems } from '@/hooks/use-nav-items';
import { FIORI } from '@/lib/fiori-style';
import { type getFioriShell } from '@/theme';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Autocomplete, Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
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
// Autocomplete's groupBy renders groups in the order options already appear
// in (it does not sort them), so this order IS the on-screen group order.
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

/**
 * SAP Fiori "Shell Search" — https://www.sap.com/design-system/fiori-design-web/v1-151/ui-elements/shell-search
 * Suggestions split the same way Fiori's spec does: "App suggestions" (jump
 * straight to a menu page — matched client-side against the sidebar's own
 * nav tree, see hooks/use-nav-items.ts) render first, then "Object
 * suggestions" (live records — products/categories/subcategories/product
 * groups/brands/attributes, fetched from GlobalSearchController) follow in
 * their own groups. Each object group only appears for a viewer who holds
 * that resource's `list_*` permission — the backend enforces this itself,
 * this component just renders whatever groups come back.
 */
function highlightMatch(text: string, query: string) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;

    return (
        <>
            {text.slice(0, idx)}
            <Box component="span" sx={{ color: FIORI.brand, fontWeight: 700 }}>
                {text.slice(idx, idx + query.length)}
            </Box>
            {text.slice(idx + query.length)}
        </>
    );
}

interface ShellSearchProps {
    /** Shell-bar color tokens from getFioriShell() — the collapsed input pill
     * borrows the shell bar's own colors. The suggestion panel below it does
     * NOT use these: it floats over ordinary page content, so it always uses
     * the page's regular Fiori surface tokens (FIORI.*) instead. */
    shell: ReturnType<typeof getFioriShell>;
    /** Below `md`, the field collapses to a magnifier button that expands on tap (matches the rest of the shell bar's responsive behavior). */
    isCompact: boolean;
}

export function ShellSearch({ shell, isCompact }: ShellSearchProps) {
    const { t } = useTranslation('common');
    const { auth } = usePage<SharedData>().props;

    const mainNavItems = useMainNavItems();
    const flatPages = useMemo(
        () => flattenNavItems(filterNavItemsByPermission(mainNavItems, auth.permissions)),
        [mainNavItems, auth.permissions],
    );

    const [mobileOpen, setMobileOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [objectResults, setObjectResults] = useState<ObjectResults>(EMPTY_RESULTS);
    const inputRef = useRef<HTMLInputElement>(null);
    const requestIdRef = useRef(0);

    const showField = !isCompact || mobileOpen;

    useEffect(() => {
        if (showField && isCompact) inputRef.current?.focus();
    }, [showField, isCompact]);

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

    const options: SearchOption[] = useMemo(() => {
        const objectOptions: ObjectOption[] = OBJECT_KINDS.flatMap((kind) =>
            (objectResults[kind] ?? []).map((item) => ({ ...item, kind, key: `${kind}-${item.id}` })),
        );
        return [...menuOptions, ...objectOptions];
    }, [menuOptions, objectResults]);

    const groupLabel = (kind: SearchOption['kind']): string => t(`search${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);
    const groupIcon = (kind: SearchOption['kind']): IconName =>
        ({
            menu: 'view',
            products: 'navProduct',
            categories: 'navMaster',
            subcategories: 'navMaster',
            productGroups: 'navMaster',
            brands: 'navMaster',
            baseUnits: 'navMaster',
            businessTypes: 'navMaster',
            productGrades: 'navMaster',
            vendors: 'navMaster',
            currencies: 'navMaster',
            points: 'navMaster',
            commissionGroups: 'navMaster',
            attributes: 'navAttributes',
            attributeGroups: 'navAttributes',
            attributeFamilies: 'navAttributes',
            users: 'navUsers',
            roles: 'navRoles',
            departments: 'navDepartments',
            jobPositions: 'navJobPositions',
        })[kind] as IconName;

    const navigate = (url: string) => {
        setQuery('');
        setDropdownOpen(false);
        if (isCompact) setMobileOpen(false);
        router.visit(url);
    };

    const shellIconSx = {
        width: 36,
        height: 36,
        borderRadius: `${shell.borderRadius}px`,
        color: shell.textColor,
        '&:hover': { bgcolor: shell.hoverBg },
        '&:active': { bgcolor: shell.activeBg },
    } as const;

    if (!showField) {
        return (
            <Tooltip title={t('search')}>
                <IconButton aria-label={t('search')} onClick={() => setMobileOpen(true)} sx={shellIconSx}>
                    <Icon name="search" sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        );
    }

    return (
        <Autocomplete<SearchOption, false, false, false>
            clearIcon={null}
            popupIcon={null}
            open={dropdownOpen && query.trim().length > 0}
            onOpen={() => setDropdownOpen(true)}
            onClose={(_, reason) => {
                if (reason !== 'selectOption') setDropdownOpen(false);
            }}
            options={options}
            loading={loading}
            groupBy={(option) => option.kind}
            getOptionLabel={(option) => (option.kind === 'menu' ? option.title : option.label)}
            filterOptions={(opts) => opts}
            inputValue={query}
            onInputChange={(_, value, reason) => {
                if (reason !== 'reset') setQuery(value);
            }}
            onChange={(_, value) => value && navigate(value.url)}
            value={null}
            noOptionsText={t('noResultsFound')}
            sx={{ width: { xs: 200, md: 300 } }}
            slotProps={{
                paper: {
                    sx: {
                        mt: 0.5,
                        border: `1px solid ${FIORI.border}`,
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
                    },
                },
            }}
            renderGroup={(params) => (
                <li key={params.key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 0.75, bgcolor: FIORI.hover }}>
                        <Icon name={groupIcon(params.group as SearchOption['kind'])} sx={{ fontSize: '0.85rem', color: FIORI.textSecondary }} />
                        <Typography
                            variant="caption"
                            fontWeight={700}
                            sx={{ color: FIORI.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                        >
                            {groupLabel(params.group as SearchOption['kind'])}
                        </Typography>
                    </Box>
                    <ul style={{ padding: 0, margin: 0 }}>{params.children}</ul>
                </li>
            )}
            renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                const sub = option.kind === 'menu' ? option.path.join(' > ') : option.sub;

                return (
                    <Box component="li" key={key} {...optionProps} sx={{ display: 'block !important', px: 2, py: 0.75 }}>
                        <Typography variant="body2" noWrap sx={{ color: FIORI.textPrimary }}>
                            {highlightMatch(option.kind === 'menu' ? option.title : option.label, query)}
                        </Typography>
                        {sub && (
                            <Typography variant="caption" noWrap sx={{ display: 'block', color: FIORI.textSecondary }}>
                                {sub}
                            </Typography>
                        )}
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    inputRef={inputRef}
                    variant="standard"
                    placeholder={t('search')}
                    onBlur={() => isCompact && !query && setMobileOpen(false)}
                    InputProps={{
                        ...params.InputProps,
                        disableUnderline: true,
                        startAdornment: <Icon name="search" sx={{ fontSize: 16, color: shell.textColor, mr: 0.75, flexShrink: 0 }} />,
                        endAdornment: (
                            <>
                                {loading && <CircularProgress size={14} thickness={5} sx={{ color: shell.textColor, mr: 0.5 }} />}
                                {params.InputProps.endAdornment}
                            </>
                        ),
                    }}
                    sx={{
                        height: 32,
                        px: 1,
                        display: 'flex',
                        alignItems: 'center',
                        bgcolor: shell.searchBg,
                        border: `1px solid ${shell.searchBorder}`,
                        borderRadius: `${shell.borderRadius}px`,
                        '&:focus-within': { borderColor: shell.interactiveColor },
                        '& .MuiInputBase-root': { fontSize: 14, color: shell.textColor, width: '100%' },
                    }}
                />
            )}
        />
    );
}
