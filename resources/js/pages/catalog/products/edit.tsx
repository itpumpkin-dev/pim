import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublishIcon from '@mui/icons-material/Publish';
import UnpublishedIcon from '@mui/icons-material/Unpublished';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import { FormEvent, memo, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import RichTextEditor from '@/components/rich-text-editor';
import { useLocale } from '@/hooks/use-locale';
import { HistoryPanel } from '@/components/history-panel';
import { CategoryTreePicker } from '@/components/category-tree-picker';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import { QuickAddOptionDialog } from '@/components/catalog/quick-add-option-dialog';
import { localizedLabel, type Translation } from '@/lib/localized-label';

interface AttributeOption {
    id: number;
    code?: string;
    admin_label?: string;
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
    is_required?: boolean;
    is_unique?: boolean;
    is_locale_based?: boolean;
    is_channel_based?: boolean;
    swatch_type?: string | null;
    options?: AttributeOption[];
    /** false when the current user's role has Read-only (not Edit) access to this attribute — see "Attribute Access" on the Role form. Absent/true means editable, for backward compatibility. */
    editable?: boolean;
    /** Family ids this attribute is assigned to — used to scope the variant-attribute picker to the product's own family. */
    family_ids?: number[];
    /** Every locale's label — lets the displayed name switch instantly on locale change instead of waiting for a server round-trip to re-resolve `name`. */
    translations?: Translation[];
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    translations?: Translation[];
    attributes: AttributeItem[];
}

interface AttributeFamily {
    id: number;
    code: string;
    name?: string;
    translations?: Translation[];
}


interface ChannelOption {
    id: number;
    code: string;
    name: string | null;
    shop_id?: number | null;
    is_live?: boolean;
    live_synced_at?: string | null;
}

interface ChannelGroup {
    platform: string;
    channels: ChannelOption[];
}

interface Product {
    id: number;
    sku: string;
    family_id: number;
    family_code: string;
    type: string;
    enabled: boolean;
    configurable_attributes?: number[];
    created_at: string;
    updated_at: string;
}

interface VariantItem {
    id?: number;
    sku: string;
    price: string;
    qty: string;
    /** attribute_id -> option code, defining which combination (e.g. Color: Red, Size: M) this variant is. Empty/absent for a manually added variant that isn't tied to any generated combination. */
    attributes?: Record<number, string>;
}

interface Props {
    product: Product;
    families: AttributeFamily[];
    assignedGroups: GroupWithAttributes[];
    productValues: Record<number | string, Record<string, Record<string | number, string>>>;
    variants?: VariantItem[];
    configurableAttributes?: AttributeItem[];
    channels?: ChannelOption[];
    channelGroups?: ChannelGroup[];
    categoryIds?: number[];
    selectedCategories?: { id: number; name: string; translations?: Translation[] }[];
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
}

type AttributeValue = string | File | (string | File)[];

// values: attribute_id -> channelKey ('global' or channel id) -> localeKey ('default' or locale id) -> value
interface ProductForm {
    sku: string;
    family_id: number;
    type: string;
    enabled: boolean;
    values: Record<string | number, Record<string, Record<string | number, AttributeValue>>>;
    variants: VariantItem[];
    configurable_attributes: number[];
    category_ids: number[];
    published_shop_ids: number[];
    associations: { related: number[]; up_sell: number[]; cross_sell: number[] };
    [key: string]: any;
}

// `product.created_at`/`updated_at` are ISO 8601 with an explicit UTC
// offset (see ProductController::edit()); this localizes them to the
// viewer's own timezone instead of showing the raw UTC string verbatim.
function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function cartesian(sets: any[][]): any[][] {
    return sets.reduce((acc, set) => acc.flatMap((x) => set.map((y) => [...x, y])), [[]]);
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'EDIT PRODUCT', href: '#' },
];

export default function ProductEdit({
    product,
    families,
    assignedGroups,
    productValues,
    variants = [],
    configurableAttributes = [],
    channels = [],
    channelGroups = [],
    categoryIds = [],
    selectedCategories = [],
    publishedShopIds = [],
    associations = { related: [], up_sell: [], cross_sell: [] },
    canViewHistory = false,
}: Props) {
    const { locales, locale: currentLocaleCode, setLocale } = useLocale();
    const { t } = useTranslation('catalog');
    const { auth } = usePage<SharedData>().props;
    const canAddAttributeOptions = auth.permissions.includes('attributes.edit_attributes');
    const [tabIndex, setTabIndex] = useState(0);
    const [relatedProducts, setRelatedProducts] = useState<ProductOption[]>(associations.related);
    const [upSellProducts, setUpSellProducts] = useState<ProductOption[]>(associations.up_sell);
    const [crossSellProducts, setCrossSellProducts] = useState<ProductOption[]>(associations.cross_sell);

    // Find active locale ID matching system language
    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);

    // Sync activeLocaleId when currentLocaleCode changes (system language changed at top dropdown)
    useEffect(() => {
        const matched = locales.find((l) => l.code === currentLocaleCode);
        if (matched && matched.id !== activeLocaleId) {
            startScopeTransition(() => setActiveLocaleId(matched.id));
        }
    }, [currentLocaleCode, locales]);

    // The server preloads values for this (first) channel across all locales;
    // switching to any other channel triggers a re-fetch of scopable fields.
    const defaultChannelId = channels.length > 0 ? channels[0].id : null;
    const [activeChannelId, setActiveChannelId] = useState<number | null>(defaultChannelId);

    // Only the platform group containing the active channel starts expanded —
    // the rest stay collapsed until the user clicks into them.
    const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(() => {
        const group = channelGroups.find((g) => g.channels.some((c) => c.id === defaultChannelId));
        return new Set(group ? [group.platform] : []);
    });
    const togglePlatform = (platform: string) => {
        setExpandedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    };

    // Switching locale/channel re-renders every field in this large form. Deferring
    // that update via a transition keeps the select itself responsive immediately
    // and lets us show a pending indicator instead of the UI silently freezing.
    const [isSwitchingScope, startScopeTransition] = useTransition();
    const handleChannelChange = (nextChannelId: number | null) => {
        startScopeTransition(() => setActiveChannelId(nextChannelId));
    };

    // Collect initial values for all real attributes (already nested channel -> locale by the backend)
    const initialValues: Record<string, Record<string, Record<string | number, any>>> = {};
    assignedGroups.forEach((group) => {
        group.attributes.forEach((attr) => {
            initialValues[attr.id] = (productValues[attr.id] as any) || {};
        });
    });

    const { data, setData, post, transform, processing, errors } = useForm<ProductForm>({
        sku: product.sku || '',
        family_id: product.family_id,
        type: (product.type || 'simple').toLowerCase(),
        enabled: Boolean(product.enabled),
        values: initialValues,
        variants: variants,
        configurable_attributes: product.configurable_attributes ?? [],
        category_ids: categoryIds,
        published_shop_ids: publishedShopIds,
        associations: {
            related: associations.related.map((p) => p.id),
            up_sell: associations.up_sell.map((p) => p.id),
            cross_sell: associations.cross_sell.map((p) => p.id),
        },
    });

    const toggleShopPublished = (shopId: number) => {
        const current = data.published_shop_ids;
        setData(
            'published_shop_ids',
            current.includes(shopId) ? current.filter((id) => id !== shopId) : [...current, shopId],
        );
    };

    // Restrict the variant-attribute picker to attributes actually assigned to
    // this product's family — same reasoning as the Create page's picker.
    const familyScopedVariantAttributes = configurableAttributes.filter(
        (attr) => (attr.options || []).length > 0 && (attr.family_ids || []).includes(Number(data.family_id)),
    );

    const optionLabelFor = (attributeId: number, code: string): string => {
        const attr = configurableAttributes.find((a) => a.id === attributeId);
        const opt = attr?.options?.find((o) => (o.code || o.admin_label || String(o.id)) === code);
        return opt?.admin_label || opt?.code || code;
    };

    // Existing variants only ever carry a real attribute combination if they
    // were generated through this picker (or the Create page's). A manually
    // added row, or one from before this feature existed, falls back to
    // guessing a label from its SKU suffix.
    const variantLabel = (v: VariantItem): string => {
        const attrs = v.attributes || {};
        const keys = Object.keys(attrs);
        if (keys.length === 0) {
            const suffix = v.sku.replace(data.sku + '-', '');
            return suffix || v.sku;
        }
        return keys.map((k) => optionLabelFor(Number(k), attrs[Number(k)])).join(' / ');
    };

    const [variantDialogOpen, setVariantDialogOpen] = useState(false);
    const [pendingVariantAttrIds, setPendingVariantAttrIds] = useState<number[]>(data.configurable_attributes);

    const openVariantDialog = () => {
        setPendingVariantAttrIds(data.configurable_attributes);
        setVariantDialogOpen(true);
    };

    const selectedVariantAttributeObjects = familyScopedVariantAttributes.filter((attr) =>
        pendingVariantAttrIds.includes(attr.id),
    );

    // Regenerating replaces the whole variants table with a fresh cartesian
    // product of the chosen attributes' options. Any combination that still
    // exists (matched by its exact set of attribute_id -> option code) keeps
    // its id/sku/price/qty; everything else becomes a brand-new row, and any
    // existing variant whose combination is no longer generated is dropped
    // (Save will then delete it, same as removing a row manually).
    const applyVariantGeneration = () => {
        const selectedAttrs = familyScopedVariantAttributes.filter((attr) => pendingVariantAttrIds.includes(attr.id));

        const optionSets = selectedAttrs.map((attr) =>
            (attr.options || []).map((opt) => ({
                attribute_id: attr.id,
                option_code: opt.code || opt.admin_label || String(opt.id),
            })),
        );

        if (optionSets.length === 0) {
            setData((prev) => ({ ...prev, configurable_attributes: [], variants: [] }));
            setVariantDialogOpen(false);
            return;
        }

        const combos = cartesian(optionSets);
        const generated: VariantItem[] = combos.map((combo) => {
            const combinationAttrs = combo.reduce((acc: Record<number, string>, c: any) => {
                acc[c.attribute_id] = c.option_code;
                return acc;
            }, {});

            const existing = data.variants.find((v) => {
                const vAttrs = v.attributes || {};
                const vKeys = Object.keys(vAttrs);
                return vKeys.length === combo.length && combo.every((c: any) => vAttrs[c.attribute_id] === c.option_code);
            });

            const suffix = combo.map((c: any) => String(c.option_code).toUpperCase()).join('-');

            return {
                id: existing?.id,
                sku: existing?.sku || (data.sku ? `${data.sku}-${suffix}` : suffix),
                price: existing?.price ?? '',
                qty: existing?.qty ?? '',
                attributes: combinationAttrs,
            };
        });

        setData((prev) => ({ ...prev, configurable_attributes: pendingVariantAttrIds, variants: generated }));
        setVariantDialogOpen(false);
    };

    const handleAddBlankVariant = () => {
        setData('variants', [...data.variants, { sku: '', price: '', qty: '', attributes: {} }]);
    };

    const handleRemoveVariant = (index: number) => {
        setData('variants', data.variants.filter((_, i) => i !== index));
    };

    // Switching away from Configurable deletes every variant child on Save
    // (see ProductController::update()) — confirm first since that's not
    // reversible from here once saved.
    const [pendingSimpleConfirm, setPendingSimpleConfirm] = useState(false);

    const handleTypeChange = (newType: string) => {
        if (data.type.toLowerCase() === 'configurable' && newType.toLowerCase() === 'simple' && data.variants.length > 0) {
            setPendingSimpleConfirm(true);
            return;
        }
        setData('type', newType);
    };

    const confirmSwitchToSimple = () => {
        setData((prev) => ({ ...prev, type: 'simple', variants: [], configurable_attributes: [] }));
        setPendingSimpleConfirm(false);
    };

    // Pushing sends a real, live create/update to Lazada — a confirm step
    // and explicit trigger (never automatic) are deliberate given that.
    const [pushConfirmShop, setPushConfirmShop] = useState<{ id: number; name: string } | null>(null);
    const [pushing, setPushing] = useState(false);
    const [pushResult, setPushResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

    // Fired the moment Push/Deactivate's confirm dialog opens — checks
    // Lazada directly (not the cached "Live" badge, which is only as fresh
    // as the last sync and may never have run for this product) so the
    // dialog reflects the real current state right before committing to a
    // live write. Shared by both dialogs since only one is ever open at once.
    const [statusCheck, setStatusCheck] = useState<{
        shopId: number;
        loading: boolean;
        is_live?: boolean;
        never_pushed?: boolean;
        status?: string | null;
        error?: string;
    } | null>(null);

    const checkLazadaStatus = (shopId: number) => {
        setStatusCheck({ shopId, loading: true });
        fetch(`/catalog/products/${product.id}/lazada-status/${shopId}`, {
            headers: { Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();
                setStatusCheck(res.ok ? { shopId, loading: false, ...body } : { shopId, loading: false, error: body.message });
            })
            .catch(() => setStatusCheck({ shopId, loading: false, error: 'Network error while checking Lazada status.' }));
    };

    const confirmPushToLazada = () => {
        if (!pushConfirmShop) return;
        const shopId = pushConfirmShop.id;
        setPushing(true);

        // This app has no <meta name="csrf-token">; Laravel's VerifyCsrfToken
        // also accepts the XSRF-TOKEN cookie it already sets on every
        // response (mirrored back as a header), so read that instead.
        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/push-lazada/${shopId}`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();
                setPushResult({ severity: res.ok ? 'success' : 'error', message: body.message });
            })
            .catch(() => setPushResult({ severity: 'error', message: 'Network error while pushing to Lazada.' }))
            .finally(() => {
                setPushing(false);
                setPushConfirmShop(null);
            });
    };

    // Same real-write reasoning as push above — explicit confirm, never
    // automatic. Reuses pushResult for the result snackbar (the response
    // message itself distinguishes "Pushed" vs "Deactivated").
    const [deactivateConfirmShop, setDeactivateConfirmShop] = useState<{ id: number; name: string } | null>(null);
    const [deactivating, setDeactivating] = useState(false);

    const confirmDeactivateLazada = () => {
        if (!deactivateConfirmShop) return;
        const shopId = deactivateConfirmShop.id;
        setDeactivating(true);

        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${product.id}/deactivate-lazada/${shopId}`, {
            method: 'POST',
            headers: {
                'X-XSRF-TOKEN': xsrfToken,
                Accept: 'application/json',
            },
        })
            .then(async (res) => {
                const body = await res.json();
                setPushResult({ severity: res.ok ? 'success' : 'error', message: body.message });
            })
            .catch(() => setPushResult({ severity: 'error', message: 'Network error while deactivating on Lazada.' }))
            .finally(() => {
                setDeactivating(false);
                setDeactivateConfirmShop(null);
            });
    };

    // Narrowed views of statusCheck for each dialog — plain `statusCheck &&`
    // (rather than the optional-chained comparison used to compute this)
    // is what lets TypeScript actually narrow away the `null` case at every
    // read site below.
    const pushStatusCheck = statusCheck && pushConfirmShop && statusCheck.shopId === pushConfirmShop.id ? statusCheck : null;
    const deactivateStatusCheck = statusCheck && deactivateConfirmShop && statusCheck.shopId === deactivateConfirmShop.id ? statusCheck : null;

    // Resolves which nested keys a given attribute's value lives under for the
    // currently selected channel/locale, based on its own scoping flags.
    const getValueKeys = (attr: AttributeItem) => ({
        channelKey: attr.is_channel_based && activeChannelId ? String(activeChannelId) : 'global',
        localeKey: attr.is_locale_based ? String(activeLocaleId) : 'default',
    });

    // useForm() doesn't document setData as identity-stable across renders,
    // so it's captured in a ref rather than a useCallback dep — that keeps
    // setAttributeValue's own identity permanently stable (empty deps)
    // regardless of whether setData's is. That stability is the point:
    // passing it down to a memoized field's onChange shouldn't by itself
    // force that field to re-render — e.g. on a pure locale switch, where
    // most fields' channelKey/localeKey/value don't change even though the
    // surrounding form re-renders. Takes the resolved channelKey/localeKey
    // rather than re-deriving them via getValueKeys(), so it doesn't need
    // attr (and isn't invalidated by it) either.
    const setDataRef = useRef(setData);
    setDataRef.current = setData;
    const setAttributeValue = useCallback((attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => {
        setDataRef.current((prev) => {
            const attrValues = prev.values[attributeId] || {};
            return {
                ...prev,
                values: {
                    ...prev.values,
                    [attributeId]: {
                        ...attrValues,
                        [channelKey]: {
                            ...(attrValues[channelKey] || {}),
                            [localeKey]: val,
                        },
                    },
                },
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Only channel/locale-based fields are re-fetched on switch; non-scopable
    // fields always live under the constant 'global'/'default' keys and never change.
    const visitedCombosRef = useRef<Set<string>>(new Set(locales.map((l) => `${defaultChannelId ?? 'none'}:${l.id}`)));
    const [loadingValues, setLoadingValues] = useState(false);

    // True while any part of the field area is showing stale data: values
    // being re-fetched for a channel/locale combo (loadingValues), or the
    // local re-render that triggers (isSwitchingScope). Attribute/group/
    // family/category labels no longer depend on useLocale()'s background
    // reload (switchingLocale) at all — they're resolved instantly from each
    // entity's preloaded `translations`, so there's nothing left to wait for
    // on a pure language switch; switchingLocale is intentionally not
    // included here anymore.
    const isFieldAreaBusy = loadingValues || isSwitchingScope;

    useEffect(() => {
        const comboKey = `${activeChannelId ?? 'none'}:${activeLocaleId}`;
        if (visitedCombosRef.current.has(comboKey)) {
            return;
        }
        visitedCombosRef.current.add(comboKey);

        const params = new URLSearchParams();
        if (activeChannelId) params.set('channel_id', String(activeChannelId));
        params.set('locale_id', String(activeLocaleId));

        setLoadingValues(true);
        fetch(`/catalog/products/${product.id}/attribute-values?${params.toString()}`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (!json?.values) return;

                const allAttributes = assignedGroups.flatMap((g) => g.attributes);

                setData((prev) => {
                    const nextValues = { ...prev.values };
                    Object.entries(json.values as Record<string, string | null>).forEach(([attributeId, value]) => {
                        if (value === null) return;
                        const attr = allAttributes.find((a) => String(a.id) === attributeId);
                        if (!attr) return;
                        const { channelKey, localeKey } = getValueKeys(attr);
                        nextValues[attributeId] = {
                            ...(nextValues[attributeId] || {}),
                            [channelKey]: {
                                ...((nextValues[attributeId] || {})[channelKey] || {}),
                                [localeKey]: value,
                            },
                        };
                    });
                    return { ...prev, values: nextValues };
                });
            })
            .catch(() => {
                // best-effort re-fetch; leave already-loaded values untouched on failure
            })
            .finally(() => setLoadingValues(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChannelId, activeLocaleId]);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        // PHP does not parse multipart/form-data bodies for PUT requests, so file
        // uploads must go through POST with a spoofed _method for Laravel to route it as PUT.
        transform((formData) => ({ ...formData, _method: 'put' }));
        post(`/catalog/products/${product.id}`, {
            onSuccess: () => router.visit('/catalog/products', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Product | SKU: ${data.sku}`} />
            <Box component="form" onSubmit={submit} sx={{ bgcolor: 'background.default', minHeight: '100vh', pb: 6 }}>
                {/* Top Tabs Bar */}
                <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', px: { xs: 2, md: 4 } }}>
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{
                            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem', minWidth: 100 },
                            '& .Mui-selected': { color: 'primary.main' },
                            '& .MuiTabs-indicator': { bgcolor: 'primary.main', height: 3 },
                        }}
                    >
                        <Tab label="General" />
                        {canViewHistory && <Tab label="History" />}
                    </Tabs>
                </Box>

                {/* Sub-Header Toolbar */}
                <Box sx={{ px: { xs: 2, md: 4 }, py: 2.5, bgcolor: '#fff', borderBottom: '1px solid #f1f5f9', mb: 3 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                        <Typography variant="h5" fontWeight={700} color="text.primary">
                            Edit Product | SKU: {data.sku}
                        </Typography>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 2,
                                    py: 0.5,
                                    bgcolor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 1.5,
                                    minHeight: 38,
                                }}
                            >
                                <Typography variant="caption" fontWeight={600} color="#64748b">
                                    {t('editingLocale') || 'Editing Language'}:
                                </Typography>
                                <Select
                                    size="small"
                                    variant="standard"
                                    disableUnderline
                                    value={activeLocaleId}
                                    onChange={(e) => {
                                        // Changing this also switches the whole app's UI language —
                                        // this page's "editing language" intentionally follows the
                                        // same global locale (see useLocale()'s setLocale below), it
                                        // isn't an independent per-page selector.
                                        const loc = locales.find((l) => l.id === Number(e.target.value));
                                        if (loc) setLocale(loc.code);
                                    }}
                                    sx={{ fontWeight: 700, color: 'primary.main', '& .MuiSelect-select': { py: 0 } }}
                                >
                                    {locales.map((loc) => (
                                        <MenuItem key={loc.id} value={loc.id}>
                                            {loc.display_name || loc.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>
                            {isFieldAreaBusy && <CircularProgress size={18} thickness={5} />}
                            <Button variant="outlined" size="small" sx={{ color: '#64748b', borderColor: '#cbd5e1', textTransform: 'none' }}>
                                More
                            </Button>

                            <Button
                                component={Link}
                                href="/catalog/products"
                                variant="outlined"
                                sx={{
                                    color: 'primary.main',
                                    borderColor: 'primary.main',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    '&:hover': { borderColor: 'primary.main', bgcolor: '#f5f3ff' },
                                }}
                            >
                                Back
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{
                                    bgcolor: 'primary.main',
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    '&:hover': { bgcolor: 'primary.main' },
                                }}
                            >
                                {processing ? 'Saving…' : 'Save Product'}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                {Object.keys(errors).length > 0 && (
                    <Box sx={{ px: { xs: 2, md: 4 }, mb: 3 }}>
                        <Alert severity="error">
                            <Typography variant="body2" fontWeight={700}>
                                {t('correctErrorsBeforeSaving')}
                            </Typography>
                            {Object.values(errors).map((message, index) => (
                                <Typography key={index} variant="body2">
                                    {message}
                                </Typography>
                            ))}
                        </Alert>
                    </Box>
                )}

                {/* Main 2-Column Layout */}
                {tabIndex === 0 && (
                <Box sx={{ px: { xs: 2, md: 4 } }}>
                    <Grid container spacing={3}>
                        {/* Left Main Area: Real Attribute Groups from Database */}
                        <Grid item xs={12} md={8.5} sx={{ position: 'relative' }}>
                            {isFieldAreaBusy && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        inset: 0,
                                        zIndex: 1,
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'center',
                                        pt: 8,
                                        bgcolor: 'rgba(255,255,255,0.6)',
                                        borderRadius: 2,
                                    }}
                                >
                                    <CircularProgress size={32} />
                                </Box>
                            )}
                            <Stack
                                spacing={3}
                                sx={{
                                    opacity: isFieldAreaBusy ? 0.5 : 1,
                                    pointerEvents: isFieldAreaBusy ? 'none' : 'auto',
                                    transition: 'opacity 0.15s',
                                }}
                            >
                                {/* General Card containing SKU and real General Attributes */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2.5 }}>
                                        General
                                    </Typography>
                                    <Stack spacing={2.5}>
                                        <TextField
                                            label="SKU *"
                                            required
                                            fullWidth
                                            size="small"
                                            value={data.sku}
                                            onChange={(e) => setData('sku', e.target.value)}
                                            error={Boolean(errors.sku)}
                                            helperText={errors.sku}
                                        />

                                        {/* Render real attributes for General group if exists */}
                                        {assignedGroups
                                            .filter((g) => g.code.toLowerCase() === 'general')
                                            .flatMap((g) => g.attributes)
                                            .filter((attr) => {
                                                if (data.type.toLowerCase() === 'configurable') {
                                                    return attr.code !== 'price' && attr.code !== 'qty';
                                                }
                                                return true;
                                            })
                                            .map((attr) => {
                                                const { channelKey, localeKey } = getValueKeys(attr);
                                                const val = data.values[attr.id]?.[channelKey]?.[localeKey] || '';
                                                const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name ?? undefined;
                                                return (
                                                    <RenderAttributeInput
                                                        key={attr.id}
                                                        attr={attr}
                                                        value={val}
                                                        channelKey={channelKey}
                                                        localeKey={localeKey}
                                                        onValueChange={setAttributeValue}
                                                        label={localizedLabel(attr, activeLocaleId)}
                                                        activeLocaleCode={activeLocaleCode}
                                                        activeChannelName={activeChannelName}
                                                        canAddOptions={canAddAttributeOptions}
                                                        sku={data.sku}
                                                    />
                                                );
                                            })}
                                    </Stack>
                                </Paper>

                                {/* Render other real Attribute Groups assigned in system */}
                                {assignedGroups
                                    .filter((g) => g.code.toLowerCase() !== 'general')
                                    .map((group) => (
                                        <Paper key={group.id} variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                            <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2.5 }}>
                                                {localizedLabel(group, activeLocaleId)}
                                            </Typography>
                                            <Stack spacing={2.5}>
                                                {group.attributes.length === 0 ? (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        No attributes assigned to this group yet.
                                                    </Typography>
                                                ) : (
                                                    group.attributes
                                                        .filter((attr) => {
                                                            if (data.type.toLowerCase() === 'configurable') {
                                                                return attr.code !== 'price' && attr.code !== 'qty';
                                                            }
                                                            return true;
                                                        })
                                                        .map((attr) => {
                                                            const { channelKey, localeKey } = getValueKeys(attr);
                                                            const val = data.values[attr.id]?.[channelKey]?.[localeKey] || '';
                                                            const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                            const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name ?? undefined;
                                                            return (
                                                                <RenderAttributeInput
                                                                    key={attr.id}
                                                                    attr={attr}
                                                                    value={val}
                                                                    channelKey={channelKey}
                                                                    localeKey={localeKey}
                                                                    onValueChange={setAttributeValue}
                                                                    label={localizedLabel(attr, activeLocaleId)}
                                                                    activeLocaleCode={activeLocaleCode}
                                                                    activeChannelName={activeChannelName}
                                                                    canAddOptions={canAddAttributeOptions}
                                                                    sku={data.sku}
                                                                />
                                                            );
                                                        })
                                                )}
                                            </Stack>
                                        </Paper>
                                    ))}

                                {/* Dynamic Cartesian Variants Table */}
                                {data.type.toLowerCase() === 'configurable' && (
                                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                                            <Typography variant="h6" fontWeight={700} color="text.primary">
                                                ตัวเลือกสินค้าย่อย (Variants List)
                                            </Typography>
                                            <Stack direction="row" spacing={1}>
                                                <Button size="small" variant="outlined" startIcon={<AutorenewIcon fontSize="small" />} onClick={openVariantDialog}>
                                                    {data.variants.length > 0 ? 'แก้ไขชุด Variant' : 'สร้าง Variant'}
                                                </Button>
                                                <Button size="small" variant="text" startIcon={<AddIcon fontSize="small" />} onClick={handleAddBlankVariant}>
                                                    เพิ่มแถวว่าง
                                                </Button>
                                            </Stack>
                                        </Stack>

                                        {data.variants.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                ยังไม่มี variant — กด &quot;สร้าง Variant&quot; เพื่อเลือก attribute (เช่น สี, ไซส์) แล้ว generate ชุดตัวเลือกทั้งหมด
                                            </Typography>
                                        ) : (
                                            <TableContainer>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell sx={{ fontWeight: 700 }}>ตัวเลือก</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }}>SKU *</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }}>ราคา</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }}>จำนวนสต๊อก (Qty)</TableCell>
                                                            <TableCell sx={{ fontWeight: 700 }} align="right">ลบ</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {data.variants.map((v, index) => (
                                                            <TableRow key={v.id ?? `new-${index}`}>
                                                                <TableCell sx={{ fontWeight: 600 }}>{variantLabel(v)}</TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        required
                                                                        value={v.sku}
                                                                        onChange={(e) => {
                                                                            const updated = [...data.variants];
                                                                            updated[index] = { ...v, sku: e.target.value };
                                                                            setData('variants', updated);
                                                                        }}
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        type="number"
                                                                        value={v.price}
                                                                        onChange={(e) => {
                                                                            const updated = [...data.variants];
                                                                            updated[index] = { ...v, price: e.target.value };
                                                                            setData('variants', updated);
                                                                        }}
                                                                        placeholder="ราคา"
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <TextField
                                                                        size="small"
                                                                        type="number"
                                                                        value={v.qty}
                                                                        onChange={(e) => {
                                                                            const updated = [...data.variants];
                                                                            updated[index] = { ...v, qty: e.target.value };
                                                                            setData('variants', updated);
                                                                        }}
                                                                        placeholder="สต๊อก"
                                                                    />
                                                                </TableCell>
                                                                <TableCell align="right">
                                                                    <IconButton size="small" color="error" onClick={() => handleRemoveVariant(index)} aria-label="Remove variant">
                                                                        <DeleteOutlineIcon fontSize="small" />
                                                                    </IconButton>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        )}
                                    </Paper>
                                )}
                            </Stack>
                        </Grid>

                        {/* Right Sidebar */}
                        <Grid item xs={12} md={3.5}>
                            <Stack spacing={3}>
                                {/* Product Info Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                        Product Info
                                    </Typography>
                                    <Stack spacing={2}>
                                        <Box>
                                            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                                Status
                                            </Typography>
                                            <Switch
                                                checked={data.enabled}
                                                onChange={(e) => setData('enabled', e.target.checked)}
                                                color="primary"
                                            />
                                        </Box>

                                        <TextField
                                            select
                                            label="Family"
                                            value={data.family_id}
                                            onChange={(e) => setData('family_id', Number(e.target.value))}
                                            size="small"
                                            fullWidth
                                            error={Boolean(errors.family_id)}
                                            helperText={errors.family_id || 'Attribute groups below update the next time you open this product after saving.'}
                                        >
                                            {families.map((fam) => (
                                                <MenuItem key={fam.id} value={fam.id}>
                                                    {localizedLabel(fam, activeLocaleId)}
                                                </MenuItem>
                                            ))}
                                        </TextField>

                                        <TextField
                                            select
                                            label="Product Type"
                                            value={data.type}
                                            onChange={(e) => handleTypeChange(e.target.value)}
                                            size="small"
                                            fullWidth
                                            error={Boolean(errors.type)}
                                            helperText={errors.type}
                                        >
                                            <MenuItem value="simple">Simple</MenuItem>
                                            <MenuItem value="configurable">Configurable</MenuItem>
                                        </TextField>

                                        <TextField
                                            label="Updated At"
                                            value={formatLocalDateTime(product.updated_at)}
                                            disabled
                                            size="small"
                                            fullWidth
                                            InputProps={{
                                                endAdornment: <CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                            }}
                                        />

                                        <TextField
                                            label="Created At"
                                            value={formatLocalDateTime(product.created_at)}
                                            disabled
                                            size="small"
                                            fullWidth
                                            InputProps={{
                                                endAdornment: <CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                            }}
                                        />
                                    </Stack>
                                </Paper>

                                {/* Categories Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                        Categories
                                    </Typography>
                                    <CategoryTreePicker
                                        value={data.category_ids}
                                        onChange={(ids) => setData('category_ids', ids)}
                                        initialSelected={selectedCategories}
                                        activeLocaleId={activeLocaleId}
                                    />
                                </Paper>

                                {/* Associations Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                        Associations
                                    </Typography>

                                    <Stack spacing={2.5}>
                                        <Box>
                                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                Related Products
                                            </Typography>
                                            <ProductPicker
                                                value={relatedProducts}
                                                onChange={(next) => {
                                                    setRelatedProducts(next);
                                                    setData('associations', { ...data.associations, related: next.map((p) => p.id) });
                                                }}
                                            />
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                Up-Sell Products
                                            </Typography>
                                            <ProductPicker
                                                value={upSellProducts}
                                                onChange={(next) => {
                                                    setUpSellProducts(next);
                                                    setData('associations', { ...data.associations, up_sell: next.map((p) => p.id) });
                                                }}
                                            />
                                        </Box>

                                        <Box>
                                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                Cross-Sell Products
                                            </Typography>
                                            <ProductPicker
                                                value={crossSellProducts}
                                                onChange={(next) => {
                                                    setCrossSellProducts(next);
                                                    setData('associations', { ...data.associations, cross_sell: next.map((p) => p.id) });
                                                }}
                                            />
                                        </Box>
                                    </Stack>
                                </Paper>

                                {/* Sales Channels Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                        Sales Channels
                                    </Typography>
                                    <Stack spacing={0.5}>
                                        {channelGroups.map((group) => {
                                            const isExpanded = expandedPlatforms.has(group.platform);
                                            const groupShopIds = group.channels
                                                .map((c) => c.shop_id)
                                                .filter((id): id is number => id != null);
                                            const checkedInGroup = groupShopIds.filter((id) => data.published_shop_ids.includes(id)).length;
                                            const allInGroupChecked = groupShopIds.length > 0 && checkedInGroup === groupShopIds.length;
                                            const someInGroupChecked = checkedInGroup > 0 && !allInGroupChecked;

                                            return (
                                                <Box key={group.platform}>
                                                    <Box
                                                        onClick={() => togglePlatform(group.platform)}
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 0.5,
                                                            py: 0.75,
                                                            px: 1,
                                                            borderRadius: 1,
                                                            cursor: 'pointer',
                                                            '&:hover': { bgcolor: 'action.hover' },
                                                        }}
                                                    >
                                                        {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                                                        {groupShopIds.length > 0 && (
                                                            <Checkbox
                                                                size="small"
                                                                checked={allInGroupChecked}
                                                                indeterminate={someInGroupChecked}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={() => {
                                                                    setData(
                                                                        'published_shop_ids',
                                                                        allInGroupChecked
                                                                            ? data.published_shop_ids.filter((id) => !groupShopIds.includes(id))
                                                                            : Array.from(new Set([...data.published_shop_ids, ...groupShopIds])),
                                                                    );
                                                                }}
                                                                sx={{ p: 0.5 }}
                                                            />
                                                        )}
                                                        <Typography variant="body2" fontWeight={700}>
                                                            {group.platform}
                                                        </Typography>
                                                        <Chip label={group.channels.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
                                                        {groupShopIds.length > 0 && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                ({checkedInGroup}/{groupShopIds.length} published)
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                    <Collapse in={isExpanded}>
                                                        <Stack sx={{ pl: 4 }}>
                                                            {group.channels.map((ch) => {
                                                                const active = activeChannelId === ch.id;
                                                                const isShop = ch.shop_id != null;
                                                                const published = isShop && data.published_shop_ids.includes(ch.shop_id as number);
                                                                // Push/Deactivate hit the backend's *saved* published_shop_ids
                                                                // (product->platformShops(), only updated on Save Product) —
                                                                // but `published` above reflects unsaved local checkbox state.
                                                                // Showing the action button as soon as the box is ticked, before
                                                                // saving, let a user check a shop and immediately click Push,
                                                                // which the backend then rejects with "not marked as published"
                                                                // since nothing was persisted yet. Only offer the action once
                                                                // the checkbox state actually matches what's saved.
                                                                const savedPublished = isShop && publishedShopIds.includes(ch.shop_id as number);
                                                                const canPushOrDeactivate = published && savedPublished;
                                                                // Only the "checked but not saved yet" direction is worth a
                                                                // hint — that's the one where a push/deactivate button would
                                                                // otherwise look available but isn't yet. The reverse
                                                                // (unchecking) has no action being blocked, just a pending save.
                                                                const hasUnsavedPublishChange = published && !savedPublished;
                                                                return (
                                                                    <Box
                                                                        key={ch.id}
                                                                        onClick={() => handleChannelChange(ch.id)}
                                                                        sx={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            py: 0.25,
                                                                            pr: 1.5,
                                                                            pl: isShop ? 0.5 : 1.5,
                                                                            borderRadius: 1,
                                                                            cursor: 'pointer',
                                                                            bgcolor: active ? 'primary.main' : 'transparent',
                                                                            color: active ? '#fff' : 'text.primary',
                                                                            '&:hover': { bgcolor: active ? 'primary.dark' : 'action.hover' },
                                                                        }}
                                                                    >
                                                                        {isShop && (
                                                                            <Checkbox
                                                                                size="small"
                                                                                checked={published}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={() => toggleShopPublished(ch.shop_id as number)}
                                                                                sx={{
                                                                                    color: active ? '#fff' : undefined,
                                                                                    '&.Mui-checked': { color: active ? '#fff' : undefined },
                                                                                }}
                                                                            />
                                                                        )}
                                                                        <Typography variant="body2" sx={{ flex: 1 }}>
                                                                            {ch.name || ch.code}
                                                                        </Typography>
                                                                        {ch.is_live && (
                                                                            <Chip
                                                                                label="Live"
                                                                                size="small"
                                                                                title={
                                                                                    ch.live_synced_at
                                                                                        ? `Confirmed live as of ${new Date(ch.live_synced_at).toLocaleString()}`
                                                                                        : 'Confirmed live on last sync'
                                                                                }
                                                                                sx={{ bgcolor: '#22c55e', color: '#fff', fontWeight: 700, height: 20, fontSize: '0.65rem', mr: 1 }}
                                                                            />
                                                                        )}
                                                                        {hasUnsavedPublishChange && (
                                                                            <Typography
                                                                                variant="caption"
                                                                                sx={{ color: active ? 'rgba(255,255,255,0.8)' : 'text.secondary', fontStyle: 'italic', whiteSpace: 'nowrap' }}
                                                                            >
                                                                                Save first
                                                                            </Typography>
                                                                        )}
                                                                        {canPushOrDeactivate && (
                                                                            <IconButton
                                                                                size="small"
                                                                                title="Push to Lazada"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setPushConfirmShop({ id: ch.shop_id as number, name: ch.name || ch.code });
                                                                                    checkLazadaStatus(ch.shop_id as number);
                                                                                }}
                                                                                sx={{ color: active ? '#fff' : 'primary.main' }}
                                                                            >
                                                                                <PublishIcon fontSize="small" />
                                                                            </IconButton>
                                                                        )}
                                                                        {/* Unlike Push (safe to offer any time — it creates or
                                                                            updates), Deactivate only makes sense once there's
                                                                            actually something live to take down. Without the
                                                                            ch.is_live check this showed up purely from "marked
                                                                            to publish", so clicking it on a shop that was
                                                                            marked but never actually pushed successfully hit
                                                                            the backend's "never been pushed — nothing to
                                                                            deactivate" error instead of just not being there. */}
                                                                        {canPushOrDeactivate && ch.is_live && (
                                                                            <IconButton
                                                                                size="small"
                                                                                title="Deactivate on Lazada"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDeactivateConfirmShop({ id: ch.shop_id as number, name: ch.name || ch.code });
                                                                                    checkLazadaStatus(ch.shop_id as number);
                                                                                }}
                                                                                sx={{ color: active ? '#fff' : 'text.secondary' }}
                                                                            >
                                                                                <UnpublishedIcon fontSize="small" />
                                                                            </IconButton>
                                                                        )}
                                                                    </Box>
                                                                );
                                                            })}
                                                        </Stack>
                                                    </Collapse>
                                                </Box>
                                            );
                                        })}
                                        {channelGroups.length === 0 && (
                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                No sales channels available.
                                            </Typography>
                                        )}
                                    </Stack>
                                </Paper>
                            </Stack>
                        </Grid>
                    </Grid>
                </Box>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />}
            </Box>

            <Dialog open={pushConfirmShop !== null} onClose={() => setPushConfirmShop(null)}>
                <DialogTitle>Push to Lazada?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This creates or updates a <strong>real, live listing</strong> on Lazada for <strong>{pushConfirmShop?.name}</strong>,
                        visible to real customers. This action can&apos;t be undone from here.
                    </DialogContentText>
                    {pushStatusCheck && (
                        <Box sx={{ mt: 2 }}>
                            {pushStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" color="text.secondary">Checking current status on Lazada...</Typography>
                                </Stack>
                            ) : pushStatusCheck.error ? (
                                <Alert severity="warning" sx={{ py: 0 }}>Couldn&apos;t check current status: {pushStatusCheck.error}</Alert>
                            ) : pushStatusCheck.never_pushed ? (
                                <Alert severity="info" sx={{ py: 0 }}>Not pushed before — this will create a new listing.</Alert>
                            ) : pushStatusCheck.is_live ? (
                                <Alert severity="success" sx={{ py: 0 }}>Currently live on Lazada — this will update the existing listing.</Alert>
                            ) : (
                                <Alert severity="info" sx={{ py: 0 }}>Exists on Lazada but not currently active (status: {pushStatusCheck.status ?? 'unknown'}) — this will update it.</Alert>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPushConfirmShop(null)} color="inherit" disabled={pushing}>
                        Cancel
                    </Button>
                    <Button onClick={confirmPushToLazada} color="primary" variant="contained" disabled={pushing} startIcon={pushing ? <CircularProgress size={16} /> : <PublishIcon />}>
                        {pushing ? 'Pushing...' : 'Push'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deactivateConfirmShop !== null} onClose={() => setDeactivateConfirmShop(null)}>
                <DialogTitle>Deactivate on Lazada?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This hides the <strong>real, live listing</strong> on Lazada for <strong>{deactivateConfirmShop?.name}</strong> from
                        customers. It stays deactivated until pushed again. This action can&apos;t be undone from here.
                    </DialogContentText>
                    {deactivateStatusCheck && (
                        <Box sx={{ mt: 2 }}>
                            {deactivateStatusCheck.loading ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={14} />
                                    <Typography variant="body2" color="text.secondary">Checking current status on Lazada...</Typography>
                                </Stack>
                            ) : deactivateStatusCheck.error ? (
                                <Alert severity="warning" sx={{ py: 0 }}>Couldn&apos;t check current status: {deactivateStatusCheck.error}</Alert>
                            ) : deactivateStatusCheck.never_pushed ? (
                                <Alert severity="error" sx={{ py: 0 }}>This product has never been pushed to this shop — there&apos;s nothing to deactivate.</Alert>
                            ) : !deactivateStatusCheck.is_live ? (
                                <Alert severity="error" sx={{ py: 0 }}>Already not active on Lazada (status: {deactivateStatusCheck.status ?? 'unknown'}) — nothing to deactivate.</Alert>
                            ) : (
                                <Alert severity="success" sx={{ py: 0 }}>Confirmed currently live on Lazada.</Alert>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeactivateConfirmShop(null)} color="inherit" disabled={deactivating}>
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmDeactivateLazada}
                        color="error"
                        variant="contained"
                        disabled={
                            deactivating ||
                            !deactivateStatusCheck ||
                            deactivateStatusCheck.loading ||
                            (!deactivateStatusCheck.error && (deactivateStatusCheck.never_pushed || !deactivateStatusCheck.is_live))
                        }
                        startIcon={deactivating ? <CircularProgress size={16} /> : <UnpublishedIcon />}
                    >
                        {deactivating ? 'Deactivating...' : 'Deactivate'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={pendingSimpleConfirm} onClose={() => setPendingSimpleConfirm(false)}>
                <DialogTitle>เปลี่ยนเป็น Simple?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        สินค้านี้มี <strong>{data.variants.length}</strong> variant อยู่ — เปลี่ยน Product Type เป็น Simple แล้วกด Save
                        จะ<strong>ลบ variant ทั้งหมด</strong>ออกจากระบบ การกระทำนี้ย้อนกลับไม่ได้
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPendingSimpleConfirm(false)} color="inherit">
                        ยกเลิก
                    </Button>
                    <Button onClick={confirmSwitchToSimple} color="error" variant="contained">
                        ยืนยัน เปลี่ยนเป็น Simple
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={variantDialogOpen} onClose={() => setVariantDialogOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2 } }}>
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>
                        เลือก Attribute สำหรับสร้าง Variant
                    </Typography>
                    <IconButton onClick={() => setVariantDialogOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    {data.variants.length > 0 && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            การสร้างใหม่จะแทนที่ตารางตัวเลือกสินค้าปัจจุบัน — ตัวเลือกที่ยังคงอยู่ (attribute/ค่าเดิม) จะเก็บ SKU/ราคา/สต๊อกเดิมไว้ให้
                            ส่วนตัวเลือกที่ไม่ได้อยู่ในชุดที่ generate ใหม่จะถูกลบออกเมื่อกด Save
                        </Alert>
                    )}
                    <Autocomplete
                        multiple
                        options={familyScopedVariantAttributes}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedVariantAttributeObjects}
                        onChange={(_, newValue) => setPendingVariantAttrIds(newValue.map((item) => item.id))}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip
                                    label={option.name || option.code}
                                    {...getTagProps({ index })}
                                    key={option.id}
                                    sx={{ bgcolor: '#f0e6ff', color: '#6b21a8', fontWeight: 600 }}
                                />
                            ))
                        }
                        renderInput={(params) => <TextField {...params} placeholder="เลือก attribute เช่น สี, ไซส์" variant="outlined" />}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
                    <Button onClick={() => setVariantDialogOpen(false)} sx={{ color: '#7e22ce', fontWeight: 700, textTransform: 'none' }}>
                        ยกเลิก
                    </Button>
                    <Button onClick={applyVariantGeneration} variant="contained" sx={{ textTransform: 'none', fontWeight: 700 }}>
                        Generate
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={pushResult !== null}
                autoHideDuration={6000}
                onClose={() => setPushResult(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={() => setPushResult(null)} severity={pushResult?.severity ?? 'success'} sx={{ width: '100%' }}>
                    {pushResult?.message}
                </Alert>
            </Snackbar>
        </AppLayout>
    );
}

// Normalizes a gallery attribute's value — the raw JSON-encoded path array
// loaded from the backend, or a (string | File)[] once the user has edited
// it in this session — into a flat list of kept paths / newly picked files.
function parseGalleryItems(value: AttributeValue): (string | File)[] {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string' && value) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((p): p is string => typeof p === 'string' && p !== '');
            }
        } catch {
            // Not JSON — a legacy single-path string; treat it as one existing image.
            return [value];
        }
    }
    return [];
}

// Renders one gallery thumbnail — an existing stored path or a locally
// picked File pending upload — with a remove button. Object URLs for File
// previews are created/revoked per item so they don't leak across renders.
function GalleryThumb({
    item,
    disabled,
    onRemove,
}: {
    item: string | File;
    disabled?: boolean;
    onRemove: () => void;
}) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (typeof item === 'string') {
            setPreviewUrl(null);
            return undefined;
        }
        const url = URL.createObjectURL(item);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [item]);

    const src =
        typeof item === 'string'
            ? /^https?:\/\//.test(item) || item.startsWith('/')
                ? item
                : `/storage/${item}`
            : previewUrl;

    return (
        <Box sx={{ position: 'relative', width: 64, height: 64 }}>
            {src ? (
                <Box
                    component="img"
                    src={src}
                    alt=""
                    sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1, border: '1px solid #e2e8f0' }}
                />
            ) : (
                <Box sx={{ width: 64, height: 64, borderRadius: 1, border: '1px solid #e2e8f0', bgcolor: '#f1f5f9' }} />
            )}
            {!disabled && (
                <IconButton
                    size="small"
                    onClick={onRemove}
                    aria-label="Remove image"
                    sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        bgcolor: '#fff',
                        border: '1px solid #e2e8f0',
                        width: 20,
                        height: 20,
                        '&:hover': { bgcolor: '#fee2e2' },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
            )}
        </Box>
    );
}

// Component to dynamically render appropriate form control based on real system attribute definition
// Pure and stateless, so it's hoisted out of RenderAttributeInput instead
// of redefined every render — SelectControl below needs it to hold a
// stable identity to stay memoizable.
function optionValue(opt: AttributeOption) {
    return opt.code || opt.admin_label || String(opt.id);
}

type FieldControlProps = {
    attributeId: number;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => void;
};

// Autocomplete (options popper, virtualization, filtering) is one of the
// heaviest controls in this form, and most attributes aren't locale-scoped
// — their value/options don't change on a pure language switch even though
// every field's *label* does (attribute names are translated). Splitting
// it out from the label/chip chrome around it and memoizing on props that
// only change when the value/options genuinely do lets it skip that
// re-render instead of rebuilding on every switch.
const SelectControl = memo(function SelectControl({
    attributeId,
    channelKey,
    localeKey,
    options,
    value,
    disabled,
    onValueChange,
}: FieldControlProps & {
    options: AttributeOption[];
    value: string;
    disabled: boolean;
}) {
    const selectedOption = options.find((opt) => optionValue(opt) === value) ?? null;
    return (
        <Autocomplete
            size="small"
            fullWidth
            disabled={disabled}
            options={options}
            value={selectedOption}
            getOptionLabel={(opt) => opt.admin_label || opt.code || ''}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            onChange={(_, newValue) => onValueChange(attributeId, channelKey, localeKey, newValue ? optionValue(newValue) : '')}
            renderInput={(params) => <TextField {...params} placeholder="Select option" />}
        />
    );
});

// Same rationale as SelectControl: a rich-text editor is expensive to
// re-render, and most attributes' values don't change on a pure locale
// switch — only their (separately rendered) label does.
const RichTextControl = memo(function RichTextControl({
    attributeId,
    channelKey,
    localeKey,
    value,
    placeholder,
    readOnly,
    onValueChange,
}: FieldControlProps & {
    value: string;
    placeholder: string;
    readOnly: boolean;
}) {
    return (
        <RichTextEditor
            value={value}
            onChange={(val) => onValueChange(attributeId, channelKey, localeKey, val)}
            placeholder={placeholder}
            readOnly={readOnly}
        />
    );
});

function RenderAttributeInput({
    attr,
    value,
    channelKey,
    localeKey,
    onValueChange,
    label,
    activeLocaleCode,
    activeChannelName,
    canAddOptions,
    sku,
}: {
    attr: AttributeItem;
    value: AttributeValue;
    channelKey: string;
    localeKey: string;
    onValueChange: (attributeId: number, channelKey: string, localeKey: string, val: AttributeValue) => void;
    label: string;
    activeLocaleCode?: string;
    activeChannelName?: string;
    canAddOptions?: boolean;
    sku: string;
}) {
    // Used by every field type below except the memoized SelectControl /
    // RichTextControl (they call onValueChange directly with the resolved
    // attributeId/channelKey/localeKey instead) — those two are the fields
    // expensive enough that a fresh closure identity here would defeat
    // their memoization on every parent re-render (e.g. a locale switch).
    const onChange = (val: AttributeValue) => onValueChange(attr.id, channelKey, localeKey, val);
    const stringValue = typeof value === 'string' ? value : '';
    const isReadOnly = attr.editable === false;
    const [addOptionOpen, setAddOptionOpen] = useState(false);

    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    useEffect(() => {
        if ((attr.type === 'image' || attr.type === 'video') && value instanceof File) {
            const url = URL.createObjectURL(value);
            setFilePreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
        setFilePreviewUrl(null);
        return undefined;
    }, [attr.type, value]);

    const renderChips = () => {
        return (
            <>
                {attr.is_locale_based ? (
                    <Chip
                        label={activeLocaleCode ? activeLocaleCode.toUpperCase() : 'LOCALE'}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#c084fc', color: '#fff', fontWeight: 700 }}
                    />
                ) : attr.is_channel_based ? (
                    // Previously always showed "DEFAULT" here regardless of
                    // which channel was actually active — a channel-based
                    // field (e.g. price_std) gave zero visual confirmation of
                    // which shop you were editing, so switching the active
                    // channel and typing a value looked identical to typing
                    // it for the wrong (or no) channel. Show the real channel
                    // name so that's no longer silently ambiguous.
                    <Chip
                        label={activeChannelName ? activeChannelName.toUpperCase() : 'CHANNEL'}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#60a5fa', color: '#fff', fontWeight: 700 }}
                    />
                ) : (
                    <Chip
                        label="DEFAULT"
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#e2e8f0', color: 'text.primary', fontWeight: 600 }}
                    />
                )}
                {isReadOnly && (
                    <Chip
                        label="READ ONLY"
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}
                    />
                )}
            </>
        );
    };

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const options = attr.options ?? [];

        return (
            <FormControl fullWidth size="small">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <SelectControl
                        attributeId={attr.id}
                        channelKey={channelKey}
                        localeKey={localeKey}
                        options={options}
                        value={stringValue}
                        disabled={isReadOnly}
                        onValueChange={onValueChange}
                    />
                    {canAddOptions && !isReadOnly && (
                        <IconButton
                            size="small"
                            title={`Add option to "${label}"`}
                            onClick={() => setAddOptionOpen(true)}
                            sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
                {canAddOptions && (
                    <QuickAddOptionDialog
                        open={addOptionOpen}
                        attributeId={attr.id}
                        attributeLabel={label}
                        activeLocaleCode={activeLocaleCode}
                        swatchType={attr.swatch_type}
                        existingOptions={options}
                        onClose={() => setAddOptionOpen(false)}
                        onCreated={(code) => onChange(code)}
                    />
                )}
            </FormControl>
        );
    }

    if (attr.type === 'textarea') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <RichTextControl
                    attributeId={attr.id}
                    channelKey={channelKey}
                    localeKey={localeKey}
                    value={stringValue}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    readOnly={isReadOnly}
                    onValueChange={onValueChange}
                />
            </Box>
        );
    }

    if (attr.type === 'price') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <TextField
                    size="small"
                    fullWidth
                    disabled={isReadOnly}
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                />
            </Box>
        );
    }

    if (attr.type === 'boolean') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Switch disabled={isReadOnly} checked={stringValue === '1' || stringValue === 'true'} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />
            </Box>
        );
    }

    if (attr.type === 'checkbox') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <FormControlLabel
                        control={<Checkbox disabled={isReadOnly} checked={stringValue === '1' || stringValue === 'true'} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />}
                        label={
                            <Typography variant="caption" fontWeight={600} color="#334155">
                                {label} {attr.is_required && '*'}
                            </Typography>
                        }
                    />
                    {renderChips()}
                </Stack>
            </Box>
        );
    }

    if (attr.type === 'date' || attr.type === 'datetime') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <TextField
                    type={attr.type === 'date' ? 'date' : 'datetime-local'}
                    size="small"
                    fullWidth
                    disabled={isReadOnly}
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                />
            </Box>
        );
    }

    if (attr.type === 'gallery') {
        // Existing images arrive as a JSON-encoded array of paths (the raw
        // ProductValue string); once the user touches this field it becomes
        // a real (string | File)[] array mixing kept paths with newly picked
        // files, which the backend merges back together on save instead of
        // replacing the whole set (see ProductController::update()).
        const items = parseGalleryItems(value);

        const removeAt = (index: number) => {
            onChange(items.filter((_, i) => i !== index));
        };

        const addFiles = (fileList: FileList) => {
            onChange([...items, ...Array.from(fileList)]);
        };

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                {items.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
                        {items.map((item, index) => (
                            <GalleryThumb
                                key={`${index}-${typeof item === 'string' ? item : item.name}`}
                                item={item}
                                disabled={isReadOnly}
                                onRemove={() => removeAt(index)}
                            />
                        ))}
                    </Stack>
                )}
                <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    disabled={isReadOnly}
                    startIcon={<CloudUploadIcon fontSize="small" />}
                    sx={{ textTransform: 'none', color: '#64748b', borderColor: '#cbd5e1' }}
                >
                    Add images
                    <input
                        type="file"
                        hidden
                        disabled={isReadOnly}
                        multiple
                        accept="image/*"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;
                            addFiles(files);
                            e.target.value = '';
                        }}
                    />
                </Button>
            </Box>
        );
    }

    if (attr.type === 'video') {
        const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

        const selectedName = value instanceof File ? value.name : '';

        let existingLabel = '';
        let existingVideoUrl = '';
        if (!selectedName && stringValue) {
            existingLabel = stringValue.split('/').pop() || stringValue;
            existingVideoUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/')
                ? stringValue
                : `/storage/${stringValue}`;
        }

        const previewSrc = filePreviewUrl || existingVideoUrl;

        // Mirrors the server-side getID3 check in ProductController
        // (validateVideoConstraints()) — this is the fast, no-round-trip
        // path that catches most bad files before a 100MB upload even
        // starts; the server check is what a request made directly against
        // the endpoint (bypassing this UI) can't get past.
        const handleVideoSelect = (file: File) => {
            setVideoError(null);

            if (file.type !== 'video/mp4') {
                setVideoError('Only MP4 videos are supported.');
                return;
            }
            if (file.size > MAX_VIDEO_BYTES) {
                setVideoError('Video must be 100MB or smaller.');
                return;
            }

            const probeUrl = URL.createObjectURL(file);
            const probe = document.createElement('video');
            probe.preload = 'metadata';
            probe.onloadedmetadata = () => {
                URL.revokeObjectURL(probeUrl);
                if (probe.duration > 60) {
                    setVideoError('Video must be 60 seconds or shorter.');
                    return;
                }
                if (probe.videoWidth < 480 || probe.videoHeight < 480) {
                    setVideoError('Video must be at least 480x480px.');
                    return;
                }
                onChange(file);
            };
            probe.onerror = () => {
                URL.revokeObjectURL(probeUrl);
                setVideoError('Could not read this video file.');
            };
            probe.src = probeUrl;
        };

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    {previewSrc && (
                        <Box
                            component="video"
                            src={previewSrc}
                            controls
                            sx={{ width: 160, maxHeight: 100, borderRadius: 1, border: '1px solid #e2e8f0' }}
                        />
                    )}
                    <Button
                        component="label"
                        variant="outlined"
                        size="small"
                        disabled={isReadOnly}
                        startIcon={<CloudUploadIcon fontSize="small" />}
                        sx={{ textTransform: 'none', color: '#64748b', borderColor: '#cbd5e1' }}
                    >
                        Choose file
                        <input
                            type="file"
                            hidden
                            disabled={isReadOnly}
                            accept="video/mp4"
                            onChange={(e) => {
                                const files = e.target.files;
                                if (!files || files.length === 0) return;
                                handleVideoSelect(files[0]);
                                // Reset so re-selecting the same (rejected) file still
                                // fires this handler again — browsers skip the change
                                // event otherwise since the input's value didn't change.
                                e.target.value = '';
                            }}
                        />
                    </Button>
                    {selectedName && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            {selectedName}
                        </Typography>
                    )}
                    {existingLabel && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            Current: {existingLabel}
                        </Typography>
                    )}
                </Stack>
                {videoError && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                        {videoError}
                    </Typography>
                )}
            </Box>
        );
    }

    if (attr.type === 'image' || attr.type === 'file') {
        const isImage = attr.type === 'image';

        const selectedName = value instanceof File ? value.name : '';

        let existingLabel = '';
        let existingImageUrl = '';
        if (!selectedName && stringValue) {
            existingLabel = stringValue.split('/').pop() || stringValue;
            if (isImage) {
                existingImageUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/')
                    ? stringValue
                    : `/storage/${stringValue}`;
            }
        }

        const previewSrc = filePreviewUrl || existingImageUrl;

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                    {isImage && previewSrc && (
                        <Box
                            component="img"
                            src={previewSrc}
                            alt={label}
                            onClick={() => setLightboxOpen(true)}
                            sx={{
                                width: 48,
                                height: 48,
                                objectFit: 'cover',
                                borderRadius: 1,
                                border: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                '&:hover': { opacity: 0.85 },
                            }}
                        />
                    )}
                    <Button
                        component="label"
                        variant="outlined"
                        size="small"
                        disabled={isReadOnly}
                        startIcon={<CloudUploadIcon fontSize="small" />}
                        sx={{ textTransform: 'none', color: '#64748b', borderColor: '#cbd5e1' }}
                    >
                        Choose file
                        <input
                            type="file"
                            hidden
                            disabled={isReadOnly}
                            accept={isImage ? 'image/*' : undefined}
                            onChange={(e) => {
                                const files = e.target.files;
                                if (!files || files.length === 0) return;
                                onChange(files[0]);
                            }}
                        />
                    </Button>
                    {selectedName && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            {selectedName}
                        </Typography>
                    )}
                    {existingLabel && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            Current: {existingLabel}
                        </Typography>
                    )}
                </Stack>
                {isImage && previewSrc && (
                    <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} maxWidth="md">
                        <DialogContent sx={{ p: 0, lineHeight: 0 }}>
                            <Box component="img" src={previewSrc} alt={label} sx={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }} />
                        </DialogContent>
                    </Dialog>
                )}
            </Box>
        );
    }

    return (
        <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="caption" fontWeight={600} color="#334155">
                    {label} {attr.is_required && '*'}
                </Typography>
                {renderChips()}
            </Stack>
            <TextField
                size="small"
                fullWidth
                disabled={isReadOnly}
                value={stringValue}
                onChange={(e) => onChange(e.target.value)}
                placeholder={attr.code === 'pid' || attr.code === 'pname' ? sku : `Enter ${label.toLowerCase()}`}
            />
        </Box>
    );
}
