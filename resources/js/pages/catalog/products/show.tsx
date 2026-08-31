import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
// Pilot batch (see resources/js/components/icon.tsx's docblock) — edit/
// chevronRight/expandMore now render via SAP-icons. CalendarToday/OpenInNew
// aren't in the pilot's curated name list yet, so left as MUI icons.
import { Icon } from '@/components/icon';
import {
    Box,
    Button,
    Chip,
    Divider,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/layouts/app-layout';
import { CategoryPathReadOnly } from '@/components/category-cascade-select';
import { HistoryPanel } from '@/components/history-panel';
import { localizedLabel, type Translation } from '@/lib/localized-label';
import { useLocale } from '@/hooks/use-locale';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, FioriStatus, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriTabsSx } from '@/lib/fiori-style';
import { UI_BORDER } from '@/lib/ui-style';
import type { MarketplacePlatform } from '@/components/marketplace-category-picker';

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
    mapped_platforms?: string[];
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    is_required?: boolean;
    is_locale_based?: boolean;
    is_channel_based?: boolean;
    options?: AttributeOption[];
    translations?: Translation[];
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    translations?: Translation[];
    attributes: AttributeItem[];
}

interface Product {
    id: number;
    sku: string;
    family_id: number;
    family_code: string;
    type: string;
    enabled: boolean;
    shopee_category_id?: number | null;
    lazada_category_id?: number | null;
    tiktok_category_id?: number | null;
    woocommerce_category_id?: number | null;
    shopee_brand_id?: number | null;
    lazada_brand_id?: number | null;
    tiktok_brand_id?: number | null;
    woocommerce_brand_id?: number | null;
    created_at: string;
    updated_at: string;
}

interface VariantItem {
    id?: number;
    sku: string;
    price: string;
    qty: string;
    attributes?: Record<number, string>;
}

interface ChannelOption {
    id: number;
    code: string;
    name: string | null;
    shop_id?: number | null;
    is_live?: boolean;
}

interface ChannelGroup {
    platform: string;
    channels: ChannelOption[];
}

interface ProductOption {
    id: number;
    sku: string;
    name: string;
}

interface Props {
    product: Product;
    assignedGroups: GroupWithAttributes[];
    productValues: Record<number | string, Record<string, Record<string | number, string>>>;
    variants?: VariantItem[];
    channelGroups?: ChannelGroup[];
    categoryIds?: number[];
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'VIEW PRODUCT', href: '#' },
];

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function optionValue(opt: AttributeOption): string {
    return opt.code || opt.admin_label || String(opt.id);
}

function optionLabel(opt: AttributeOption): string {
    return opt.admin_label || opt.code || String(opt.id);
}

function resolveStorageUrl(path: string): string {
    return /^https?:\/\//.test(path) || path.startsWith('/') ? path : `/storage/${path}`;
}

function parseGalleryPaths(raw: string): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string' && p !== '') : [];
    } catch {
        return [];
    }
}

/** Empty-value placeholder — same wording used everywhere else this file shows "nothing entered". */
function EmptyValue() {
    return (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            (ไม่ได้กรอก)
        </Typography>
    );
}

/**
 * Read-only display of one platform's marketplace-category override (see
 * edit.tsx's MarketplaceCategoryPicker, which this mirrors minus the
 * picker dialog) — resolves the stored id to its root-to-leaf name path via
 * the same lookup endpoint that dialog preloads on open. `id` null means no
 * override is set for this product/platform, which just falls back to
 * whatever System Categories resolves to for it (see Shopee/Lazada/TikTok/
 * WooCommerceProductSyncService::resolve*CategoryId()) — shown as an
 * explanatory note here, not as "nothing entered", since it's a legitimate
 * resting state, not an omission.
 */
function MarketplaceCategoryReadOnly({ platform, id }: { platform: MarketplacePlatform; id: number | null | undefined }) {
    const { t } = useTranslation('catalog');
    const [path, setPath] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!id) {
            setPath([]);
            return;
        }
        setLoading(true);
        fetch(`/catalog/marketplace-categories/${platform}/path?id=${id}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then(setPath)
            .finally(() => setLoading(false));
    }, [platform, id]);

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('loadingEllipsis')}
            </Typography>
        );
    }

    if (path.length === 0) {
        return (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                {t('followsSystemCategory')}
            </Typography>
        );
    }

    return <Typography variant="body2">{path.map((n) => n.name).join(' > ')}</Typography>;
}

/** Read-only display of one platform's marketplace-brand override — same shape as MarketplaceCategoryReadOnly above, see its docblock. */
function MarketplaceBrandReadOnly({ platform, id }: { platform: MarketplacePlatform; id: number | null | undefined }) {
    const { t } = useTranslation('catalog');
    const [name, setName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!id) {
            setName(null);
            return;
        }
        setLoading(true);
        fetch(`/catalog/marketplace-brands/${platform}/lookup?id=${id}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((brand: { id: number; name: string } | null) => setName(brand?.name ?? null))
            .finally(() => setLoading(false));
    }, [platform, id]);

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('loadingEllipsis')}
            </Typography>
        );
    }

    if (!name) {
        return (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                {t('followsSystemBrand')}
            </Typography>
        );
    }

    return <Typography variant="body2">{name}</Typography>;
}

/**
 * Read-only counterpart to edit.tsx's RenderAttributeInput — same set of
 * `attr.type` branches, but every one just displays the resolved value
 * (text/chip/thumbnail) instead of a form control. Kept as its own function
 * here rather than importing edit.tsx's version since that one is built
 * entirely around editable state (onChange, file pickers, dialogs) that a
 * read page has no use for.
 */
function RenderAttributeValue({ attr, value }: { attr: AttributeItem; value: string }) {
    if (!value) {
        return <EmptyValue />;
    }

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const match = attr.options?.find((opt) => optionValue(opt) === value);
        return <Typography variant="body2">{match ? optionLabel(match) : value}</Typography>;
    }

    if (attr.type === 'textarea') {
        // Rich text is stored as HTML (see edit.tsx's RichTextControl) — render
        // it as-is so formatting (bold/lists/etc.) survives, same as what the
        // editor showed while it was being entered.
        return <Box sx={{ typography: 'body2', '& p': { m: 0 } }} dangerouslySetInnerHTML={{ __html: value }} />;
    }

    if (attr.type === 'boolean' || attr.type === 'checkbox') {
        const checked = value === '1' || value === 'true';
        return (
            <Chip
                label={checked ? 'ใช่' : 'ไม่ใช่'}
                size="small"
                sx={{ bgcolor: checked ? FIORI.successBg : FIORI.neutralBg, color: checked ? FIORI.success : FIORI.textSecondary, fontWeight: 600 }}
            />
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return <Typography variant="body2">{formatLocalDateTime(value) === value ? value : formatLocalDateTime(value)}</Typography>;
    }

    if (attr.type === 'gallery') {
        const paths = parseGalleryPaths(value);
        if (paths.length === 0) return <EmptyValue />;

        return (
            <Stack direction="row" spacing={1} flexWrap="wrap">
                {paths.map((path, i) => (
                    <Box
                        key={i}
                        component="img"
                        src={resolveStorageUrl(path)}
                        alt={`${attr.name} ${i + 1}`}
                        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, border: `1px solid ${UI_BORDER}` }}
                    />
                ))}
            </Stack>
        );
    }

    if (attr.type === 'video') {
        return (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video controls src={resolveStorageUrl(value)} style={{ maxWidth: 320, maxHeight: 200, borderRadius: 4 }} />
        );
    }

    if (attr.type === 'image') {
        return (
            <Box
                component="img"
                src={resolveStorageUrl(value)}
                alt={attr.name}
                sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1, border: `1px solid ${UI_BORDER}` }}
            />
        );
    }

    if (attr.type === 'file') {
        return (
            <a href={resolveStorageUrl(value)} target="_blank" rel="noreferrer">
                {value.split('/').pop() || value}
            </a>
        );
    }

    // Default (text/number/price/anything unlisted) — auto-link a bare URL
    // (e.g. a YouTube link stored in a plain text field) since this is a
    // read view with nothing else useful to do with it.
    if (/^https?:\/\//.test(value)) {
        return (
            <a href={value} target="_blank" rel="noreferrer">
                {value}
            </a>
        );
    }

    return <Typography variant="body2">{value}</Typography>;
}

export default function ProductShow({
    product,
    assignedGroups,
    productValues,
    variants = [],
    channelGroups = [],
    categoryIds = [],
    publishedShopIds = [],
    associations = { related: [], up_sell: [], cross_sell: [] },
    canViewHistory = false,
}: Props) {
    const { locales, locale: currentLocaleCode, setLocale } = useLocale();
    const { t } = useTranslation('catalog');
    const [tabIndex, setTabIndex] = useState(0);
    const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<number, boolean>>({});
    const toggleGroupCollapse = (groupId: number) => setCollapsedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);
    useEffect(() => {
        const matched = locales.find((l) => l.code === currentLocaleCode);
        if (matched && matched.id !== activeLocaleId) {
            setActiveLocaleId(matched.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentLocaleCode, locales]);

    // Values were preloaded scoped to the Default (All Channels) scope (see
    // ProductController::buildProductFormProps()) — a read page has no
    // channel switcher of its own, so this always shows that default scope,
    // same as what Edit Product shows before anyone touches its Sales
    // Channels panel.
    const getValue = (attr: AttributeItem): string => {
        const localeKey = attr.is_locale_based ? String(activeLocaleId) : 'default';
        return productValues[attr.id]?.['global']?.[localeKey] ?? productValues[attr.id]?.['global']?.['default'] ?? '';
    };

    const brandAttr = (() => {
        for (const group of assignedGroups) {
            const found = group.attributes.find((attr) => attr.code === 'pbrand');
            if (found) return found;
        }
        return null;
    })();

    const publishedChannels = channelGroups
        .map((group) => ({
            platform: group.platform,
            channels: group.channels.filter((ch) => ch.shop_id != null && publishedShopIds.includes(ch.shop_id)),
        }))
        .filter((group) => group.channels.length > 0);

    const variantColumns: FioriResponsiveColumn<{ v: VariantItem; index: number }>[] = [
        { key: 'sku', header: 'SKU', priority: 'always', render: (row) => row.v.sku },
        { key: 'price', header: 'Price', priority: 'high', render: (row) => row.v.price || '-' },
        { key: 'qty', header: 'Qty', priority: 'high', render: (row) => row.v.qty || '-' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`View Product | SKU: ${product.sku}`} />
            <Box sx={{ bgcolor: FIORI.pageBg, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ bgcolor: FIORI.surface, px: { xs: 2, md: 4 } }}>
                    <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={fioriTabsSx}>
                        <Tab label="General" />
                        {canViewHistory && <Tab label="History" />}
                    </Tabs>
                </Box>

                <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, bgcolor: FIORI.surface, borderBottom: `1px solid ${FIORI.border}`, mb: 0.5 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Icon name="view" fontSize="small" sx={{ color: FIORI.textSecondary }} />
                            <Typography variant="h5" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                View Product | SKU: {product.sku}
                            </Typography>
                        </Stack>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 2,
                                    py: 0.5,
                                    bgcolor: FIORI.headerBg,
                                    border: `1px solid ${FIORI.border}`,
                                    borderRadius: 1.5,
                                    minHeight: 38,
                                }}
                            >
                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                    {t('editingLocale') || 'Language'}:
                                </Typography>
                                <Select
                                    size="small"
                                    variant="standard"
                                    disableUnderline
                                    value={activeLocaleId}
                                    onChange={(e) => {
                                        const loc = locales.find((l) => l.id === Number(e.target.value));
                                        if (loc) setLocale(loc.code);
                                    }}
                                    sx={{ fontWeight: 700, color: FIORI.textPrimary, '& .MuiSelect-select': { py: 0 } }}
                                >
                                    {locales.map((loc) => (
                                        <MenuItem key={loc.id} value={loc.id}>
                                            {loc.display_name || loc.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>

                            <FioriStatus label={product.enabled ? 'Active' : 'Inactive'} tone={product.enabled ? 'success' : 'neutral'} />

                            <Box
                                component="a"
                                href={`/products/${product.id}`}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ display: 'inline-flex' }}
                                title="Preview on storefront"
                            >
                                <IconButton size="small" sx={{ border: `1px solid ${FIORI.border}`, borderRadius: '6px', color: FIORI.textSecondary }}>
                                    <OpenInNewIcon fontSize="small" />
                                </IconButton>
                            </Box>

                            <Button component={Link} href="/catalog/products" startIcon={<Icon name="back" fontSize="small" />} sx={fioriDefaultSx}>
                                Back
                            </Button>
                            <Button
                                component={Link}
                                href={`/catalog/products/${product.id}/edit`}
                                variant="contained"
                                startIcon={<Icon name="edit" fontSize="small" />}
                                sx={fioriEmphasizedSx}
                            >
                                Edit
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
                    {tabIndex === 0 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8.5}>
                                <Stack spacing={3}>
                                    {assignedGroups.map((group) => {
                                        const isGeneral = group.code.toLowerCase() === 'general';
                                        const isSales = group.code.toLowerCase() === 'pricing_packaging';
                                        const visibleAttrs = group.attributes.filter((attr) => attr.code !== 'pbrand');
                                        const isGroupCollapsed = Boolean(collapsedGroupIds[group.id]);

                                        return (
                                            <Paper key={group.id} sx={{ ...fioriCardSx, p: 3 }}>
                                                <Stack
                                                    direction="row"
                                                    alignItems="center"
                                                    spacing={0.5}
                                                    onClick={() => toggleGroupCollapse(group.id)}
                                                    sx={{ mb: isGroupCollapsed ? 0 : 2.5, cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <IconButton size="small" sx={{ p: 0.5 }}>
                                                        {isGroupCollapsed ? <Icon name="chevronRight" fontSize="small" /> : <Icon name="expandMore" fontSize="small" />}
                                                    </IconButton>
                                                    <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                                                        {localizedLabel(group, activeLocaleId)}
                                                    </Typography>
                                                </Stack>
                                                {!isGroupCollapsed && (
                                                    <Stack spacing={2.5}>
                                                        {isGeneral && (
                                                            <Box>
                                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                                                                    SKU
                                                                </Typography>
                                                                <Typography variant="body2">{product.sku}</Typography>
                                                            </Box>
                                                        )}

                                                        {visibleAttrs.length === 0 && !isGeneral && !(isSales && variants.length > 0) && (
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                No attributes assigned to this group.
                                                            </Typography>
                                                        )}

                                                        {visibleAttrs.map((attr) => (
                                                            <Box key={attr.id}>
                                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                                                    {localizedLabel(attr, activeLocaleId)}
                                                                </Typography>
                                                                <RenderAttributeValue attr={attr} value={getValue(attr)} />
                                                            </Box>
                                                        ))}

                                                        {isSales && variants.length > 0 && (
                                                            <Box>
                                                                <Typography variant="subtitle1" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                                                    ตัวเลือกสินค้าย่อย (Variants)
                                                                </Typography>
                                                                <FioriResponsiveTable
                                                                    variant="plain"
                                                                    size="small"
                                                                    columns={variantColumns}
                                                                    rows={variants.map((v, index) => ({ v, index }))}
                                                                    getRowKey={(row) => row.v.id ?? `new-${row.index}`}
                                                                />
                                                            </Box>
                                                        )}
                                                    </Stack>
                                                )}
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            </Grid>

                            <Grid item xs={12} md={3.5}>
                                <Stack spacing={3}>
                                    <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                        <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                            Product Info
                                        </Typography>
                                        <Stack spacing={2}>
                                            <Box>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                                                    Family
                                                </Typography>
                                                <Typography variant="body2">{product.family_code}</Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                                                    Product Type
                                                </Typography>
                                                <Typography variant="body2">{product.type}</Typography>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                                                    Updated At
                                                </Typography>
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    <CalendarTodayIcon fontSize="inherit" sx={{ color: 'text.secondary' }} />
                                                    <Typography variant="body2">{formatLocalDateTime(product.updated_at)}</Typography>
                                                </Stack>
                                            </Box>
                                            <Box>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                                                    Created At
                                                </Typography>
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    <CalendarTodayIcon fontSize="inherit" sx={{ color: 'text.secondary' }} />
                                                    <Typography variant="body2">{formatLocalDateTime(product.created_at)}</Typography>
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    </Paper>

                                    <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                        <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                            {t('categoriesBlockTitle')}
                                        </Typography>
                                        <Stack spacing={1}>
                                            <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                {t('systemCategoriesLabel')}
                                            </Typography>
                                            <CategoryPathReadOnly categoryIds={categoryIds} />
                                        </Stack>
                                        <Divider sx={{ my: 2 }} />
                                        <Stack spacing={1.5}>
                                            <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                {t('marketplaceCategoriesLabel')}
                                            </Typography>
                                            {(
                                                [
                                                    ['shopee', 'Shopee', product.shopee_category_id],
                                                    ['lazada', 'Lazada', product.lazada_category_id],
                                                    ['tiktok', 'TikTok', product.tiktok_category_id],
                                                    ['woocommerce', 'WooCommerce', product.woocommerce_category_id],
                                                ] as const
                                            ).map(([platform, label, id]) => (
                                                <Box key={platform}>
                                                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                                        {label}
                                                    </Typography>
                                                    <MarketplaceCategoryReadOnly platform={platform} id={id} />
                                                </Box>
                                            ))}
                                        </Stack>
                                    </Paper>

                                    {brandAttr && (
                                        <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                            <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                                {t('brandBlockTitle')}
                                            </Typography>
                                            <Stack spacing={1}>
                                                <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                    {t('systemBrandLabel')}
                                                </Typography>
                                                <RenderAttributeValue attr={brandAttr} value={getValue(brandAttr)} />
                                                {(() => {
                                                    const stringValue = getValue(brandAttr);
                                                    const selectedOption = brandAttr.options?.find((opt) => optionValue(opt) === stringValue);
                                                    const mapped = selectedOption?.mapped_platforms ?? [];
                                                    if (!selectedOption) return null;

                                                    return (
                                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {t('marketplaceMappingLabel')}
                                                            </Typography>
                                                            {mapped.length > 0 ? (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {t('mappedToPlatformsCount', { count: mapped.length })} ({mapped.join(', ')})
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                                    {t('notMappedToAnyMarketplace')}
                                                                </Typography>
                                                            )}
                                                        </Stack>
                                                    );
                                                })()}
                                            </Stack>
                                            <Divider sx={{ my: 2 }} />
                                            <Stack spacing={1.5}>
                                                <Typography variant="caption" fontWeight={800} fontSize="large" color="text.secondary">
                                                    {t('marketplaceBrandLabel')}
                                                </Typography>
                                                {(
                                                    [
                                                        ['shopee', 'Shopee', product.shopee_brand_id],
                                                        ['lazada', 'Lazada', product.lazada_brand_id],
                                                        ['tiktok', 'TikTok', product.tiktok_brand_id],
                                                        ['woocommerce', 'WooCommerce', product.woocommerce_brand_id],
                                                    ] as const
                                                ).map(([platform, label, id]) => (
                                                    <Box key={platform}>
                                                        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                                            {label}
                                                        </Typography>
                                                        <MarketplaceBrandReadOnly platform={platform} id={id} />
                                                    </Box>
                                                ))}
                                            </Stack>
                                        </Paper>
                                    )}

                                    {/* <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                        <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                            Associations
                                        </Typography>
                                        <Stack spacing={2}>
                                            {(
                                                [
                                                    ['Related', associations.related],
                                                    ['Up-sell', associations.up_sell],
                                                    ['Cross-sell', associations.cross_sell],
                                                ] as const
                                            ).map(([label, list]) => (
                                                <Box key={label}>
                                                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                                        {label}
                                                    </Typography>
                                                    {list.length > 0 ? (
                                                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                            {list.map((p) => (
                                                                <Chip key={p.id} label={`${p.name} (${p.sku})`} size="small" variant="outlined" />
                                                            ))}
                                                        </Stack>
                                                    ) : (
                                                        <EmptyValue />
                                                    )}
                                                </Box>
                                            ))}
                                        </Stack>
                                    </Paper> */}

                                    <Paper sx={{ ...fioriCardSx, p: 3 }}>
                                        <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                            Sales Channels
                                        </Typography>
                                        {publishedChannels.length > 0 ? (
                                            <Stack spacing={1.5}>
                                                {publishedChannels.map((group) => (
                                                    <Box key={group.platform}>
                                                        <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                                            {group.platform}
                                                        </Typography>
                                                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                            {group.channels.map((ch) => (
                                                                <Chip
                                                                    key={ch.id}
                                                                    label={ch.is_live ? `${ch.name} · live` : ch.name || ch.code}
                                                                    size="small"
                                                                    sx={{
                                                                        bgcolor: ch.is_live ? FIORI.successBg : FIORI.headerBg,
                                                                        color: ch.is_live ? FIORI.success : FIORI.textSecondary,
                                                                        fontWeight: 600,
                                                                    }}
                                                                />
                                                            ))}
                                                        </Stack>
                                                    </Box>
                                                ))}
                                            </Stack>
                                        ) : (
                                            <EmptyValue />
                                        )}
                                    </Paper>
                                </Stack>
                            </Grid>
                        </Grid>
                    )}

                    {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />}
                </Box>
            </Box>
        </AppLayout>
    );
}
