import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublishIcon from '@mui/icons-material/Publish';
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
import { FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import RichTextEditor from '@/components/rich-text-editor';
import { useLocale } from '@/hooks/use-locale';
import { HistoryPanel } from '@/components/history-panel';
import { CategoryTreePicker } from '@/components/category-tree-picker';
import { ProductPicker, type ProductOption } from '@/components/product-picker';

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
    options?: AttributeOption[];
}

interface GroupWithAttributes {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
}

interface AttributeFamily {
    id: number;
    code: string;
    name?: string;
}

interface ChannelOption {
    id: number;
    code: string;
    name: string | null;
    shop_id?: number | null;
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
    created_at: string;
    updated_at: string;
}

interface VariantItem {
    id?: number;
    sku: string;
    price: string;
    qty: string;
    values?: Record<number, string>;
}

interface Props {
    product: Product;
    families: AttributeFamily[];
    assignedGroups: GroupWithAttributes[];
    productValues: Record<number | string, Record<string, Record<string | number, string>>>;
    variants?: VariantItem[];
    channels?: ChannelOption[];
    channelGroups?: ChannelGroup[];
    categoryIds?: number[];
    publishedShopIds?: number[];
    associations?: { related: ProductOption[]; up_sell: ProductOption[]; cross_sell: ProductOption[] };
    canViewHistory?: boolean;
}

type AttributeValue = string | File | File[];

// values: attribute_id -> channelKey ('global' or channel id) -> localeKey ('default' or locale id) -> value
interface ProductForm {
    sku: string;
    family_id: number;
    type: string;
    enabled: boolean;
    values: Record<string | number, Record<string, Record<string | number, AttributeValue>>>;
    variants: VariantItem[];
    category_ids: number[];
    published_shop_ids: number[];
    associations: { related: number[]; up_sell: number[]; cross_sell: number[] };
    [key: string]: any;
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
    channels = [],
    channelGroups = [],
    categoryIds = [],
    publishedShopIds = [],
    associations = { related: [], up_sell: [], cross_sell: [] },
    canViewHistory = false,
}: Props) {
    const { locales, locale: currentLocaleCode } = useLocale();
    const [tabIndex, setTabIndex] = useState(0);
    const [relatedProducts, setRelatedProducts] = useState<ProductOption[]>(associations.related);
    const [upSellProducts, setUpSellProducts] = useState<ProductOption[]>(associations.up_sell);
    const [crossSellProducts, setCrossSellProducts] = useState<ProductOption[]>(associations.cross_sell);

    // Find active locale ID matching system language
    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);

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
    const handleLocaleChange = (nextLocaleId: number) => {
        startScopeTransition(() => setActiveLocaleId(nextLocaleId));
    };
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
        type: product.type || 'simple',
        enabled: Boolean(product.enabled),
        values: initialValues,
        variants: variants,
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

    // Pushing sends a real, live create/update to Lazada — a confirm step
    // and explicit trigger (never automatic) are deliberate given that.
    const [pushConfirmShop, setPushConfirmShop] = useState<{ id: number; name: string } | null>(null);
    const [pushing, setPushing] = useState(false);
    const [pushResult, setPushResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

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

    // Resolves which nested keys a given attribute's value lives under for the
    // currently selected channel/locale, based on its own scoping flags.
    const getValueKeys = (attr: AttributeItem) => ({
        channelKey: attr.is_channel_based && activeChannelId ? String(activeChannelId) : 'global',
        localeKey: attr.is_locale_based ? String(activeLocaleId) : 'default',
    });

    const handleAttributeChange = (attributeId: number, val: AttributeValue, attr: AttributeItem) => {
        const { channelKey, localeKey } = getValueKeys(attr);
        const attrValues = data.values[attributeId] || {};
        setData('values', {
            ...data.values,
            [attributeId]: {
                ...attrValues,
                [channelKey]: {
                    ...(attrValues[channelKey] || {}),
                    [localeKey]: val,
                },
            },
        });
    };

    // Only channel/locale-based fields are re-fetched on switch; non-scopable
    // fields always live under the constant 'global'/'default' keys and never change.
    const visitedCombosRef = useRef<Set<string>>(new Set(locales.map((l) => `${defaultChannelId ?? 'none'}:${l.id}`)));
    const [loadingValues, setLoadingValues] = useState(false);

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
                            <Select
                                size="small"
                                value={activeLocaleId}
                                onChange={(e) => handleLocaleChange(Number(e.target.value))}
                                sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 180 }}
                            >
                                {locales.map((loc) => (
                                    <MenuItem key={loc.id} value={loc.id}>
                                        {loc.display_name || loc.code}
                                    </MenuItem>
                                ))}
                            </Select>
                            {(loadingValues || isSwitchingScope) && <CircularProgress size={18} thickness={5} />}
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
                                sx={{
                                    bgcolor: 'primary.main',
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    '&:hover': { bgcolor: 'primary.main' },
                                }}
                            >
                                Save Product
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                {/* Main 2-Column Layout */}
                {tabIndex === 0 && (
                <Box sx={{ px: { xs: 2, md: 4 } }}>
                    <Grid container spacing={3}>
                        {/* Left Main Area: Real Attribute Groups from Database */}
                        <Grid item xs={12} md={8.5} sx={{ position: 'relative' }}>
                            {(loadingValues || isSwitchingScope) && (
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
                                    opacity: loadingValues || isSwitchingScope ? 0.5 : 1,
                                    pointerEvents: loadingValues || isSwitchingScope ? 'none' : 'auto',
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
                                                return (
                                                    <RenderAttributeInput
                                                        key={attr.id}
                                                        attr={attr}
                                                        value={val}
                                                        onChange={(newVal) => handleAttributeChange(attr.id, newVal, attr)}
                                                        activeLocaleCode={activeLocaleCode}
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
                                                {group.name}
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
                                                            return (
                                                                <RenderAttributeInput
                                                                    key={attr.id}
                                                                    attr={attr}
                                                                    value={val}
                                                                    onChange={(newVal) => handleAttributeChange(attr.id, newVal, attr)}
                                                                    activeLocaleCode={activeLocaleCode}
                                                                />
                                                            );
                                                        })
                                                )}
                                            </Stack>
                                        </Paper>
                                    ))}

                                {/* Dynamic Cartesian Variants Table */}
                                {data.type.toLowerCase() === 'configurable' && data.variants.length > 0 && (
                                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                        <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                            ตัวเลือกสินค้าย่อย (Variants List)
                                        </Typography>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 700 }}>ตัวเลือก</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }}>SKU *</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }}>ราคา</TableCell>
                                                        <TableCell sx={{ fontWeight: 700 }}>จำนวนสต๊อก (Qty)</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {data.variants.map((v, index) => {
                                                        const suffix = v.sku.replace(data.sku + '-', '');
                                                        return (
                                                            <TableRow key={index}>
                                                                <TableCell sx={{ fontWeight: 600 }}>{suffix || v.sku}</TableCell>
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
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
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
                                            label="Family"
                                            value={product.family_code}
                                            disabled
                                            size="small"
                                            fullWidth
                                        />

                                        <TextField
                                            label="Product Type"
                                            value={product.type}
                                            disabled
                                            size="small"
                                            fullWidth
                                        />

                                        <TextField
                                            label="Updated At"
                                            value={product.updated_at}
                                            disabled
                                            size="small"
                                            fullWidth
                                            InputProps={{
                                                endAdornment: <CalendarTodayIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                            }}
                                        />

                                        <TextField
                                            label="Created At"
                                            value={product.created_at}
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
                                    <CategoryTreePicker value={data.category_ids} onChange={(ids) => setData('category_ids', ids)} />
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
                                                                        {published && (
                                                                            <IconButton
                                                                                size="small"
                                                                                title="Push to Lazada"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setPushConfirmShop({ id: ch.shop_id as number, name: ch.name || ch.code });
                                                                                }}
                                                                                sx={{ color: active ? '#fff' : 'primary.main' }}
                                                                            >
                                                                                <PublishIcon fontSize="small" />
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

// Component to dynamically render appropriate form control based on real system attribute definition
function RenderAttributeInput({
    attr,
    value,
    onChange,
    activeLocaleCode,
}: {
    attr: AttributeItem;
    value: AttributeValue;
    onChange: (val: AttributeValue) => void;
    activeLocaleCode?: string;
}) {
    const label = attr.name || attr.code;
    const stringValue = typeof value === 'string' ? value : '';

    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    useEffect(() => {
        if (attr.type === 'image' && value instanceof File) {
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
                ) : (
                    <Chip
                        label="DEFAULT"
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#e2e8f0', color: 'text.primary', fontWeight: 600 }}
                    />
                )}
            </>
        );
    };

    if (attr.type === 'select' || attr.type === 'multiselect') {
        const options = attr.options ?? [];
        const optionValue = (opt: AttributeOption) => opt.code || opt.admin_label || String(opt.id);
        const selectedOption = options.find((opt) => optionValue(opt) === stringValue) ?? null;

        return (
            <FormControl fullWidth size="small">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Autocomplete
                    size="small"
                    options={options}
                    value={selectedOption}
                    getOptionLabel={(opt) => opt.admin_label || opt.code || ''}
                    isOptionEqualToValue={(opt, val) => opt.id === val.id}
                    onChange={(_, newValue) => onChange(newValue ? optionValue(newValue) : '')}
                    renderInput={(params) => <TextField {...params} placeholder="Select option" />}
                />
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
                <RichTextEditor
                    value={stringValue}
                    onChange={onChange}
                    placeholder={`Enter ${label.toLowerCase()}`}
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
                <Switch checked={stringValue === '1' || stringValue === 'true'} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />
            </Box>
        );
    }

    if (attr.type === 'checkbox') {
        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <FormControlLabel
                        control={<Checkbox checked={stringValue === '1' || stringValue === 'true'} onChange={(e) => onChange(e.target.checked ? '1' : '0')} />}
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
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                />
            </Box>
        );
    }

    if (attr.type === 'image' || attr.type === 'file' || attr.type === 'gallery') {
        const isGallery = attr.type === 'gallery';
        const isImage = attr.type === 'image';

        const selectedNames: string[] = isGallery
            ? Array.isArray(value)
                ? value.map((f) => f.name)
                : []
            : value instanceof File
                ? [value.name]
                : [];

        let existingLabel = '';
        let existingImageUrl = '';
        if (selectedNames.length === 0 && stringValue) {
            if (isGallery) {
                try {
                    const parsed = JSON.parse(stringValue);
                    existingLabel = `${Array.isArray(parsed) ? parsed.length : 1} file(s) uploaded`;
                } catch {
                    existingLabel = '1 file uploaded';
                }
            } else {
                existingLabel = stringValue.split('/').pop() || stringValue;
                if (isImage) {
                    existingImageUrl = /^https?:\/\//.test(stringValue) || stringValue.startsWith('/')
                        ? stringValue
                        : `/storage/${stringValue}`;
                }
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
                        startIcon={<CloudUploadIcon fontSize="small" />}
                        sx={{ textTransform: 'none', color: '#64748b', borderColor: '#cbd5e1' }}
                    >
                        {isGallery ? 'Upload images' : 'Choose file'}
                        <input
                            type="file"
                            hidden
                            multiple={isGallery}
                            accept={isImage || isGallery ? 'image/*' : undefined}
                            onChange={(e) => {
                                const files = e.target.files;
                                if (!files || files.length === 0) return;
                                onChange(isGallery ? Array.from(files) : files[0]);
                            }}
                        />
                    </Button>
                    {selectedNames.length > 0 && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 260 }}>
                            {selectedNames.join(', ')}
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
                value={stringValue}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
            />
        </Box>
    );
}
