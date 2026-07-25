import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
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
import { FormEvent, useEffect, useRef, useState } from 'react';
import RichTextEditor from '@/components/rich-text-editor';
import { useLocale } from '@/hooks/use-locale';
import { HistoryPanel } from '@/components/history-panel';

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
    [key: string]: any;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'EDIT PRODUCT', href: '#' },
];

export default function ProductEdit({ product, families, assignedGroups, productValues, variants = [], channels = [], canViewHistory = false }: Props) {
    const { locales, locale: currentLocaleCode } = useLocale();
    const [tabIndex, setTabIndex] = useState(0);

    // Find active locale ID matching system language
    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);

    // The server preloads values for this (first) channel across all locales;
    // switching to any other channel triggers a re-fetch of scopable fields.
    const defaultChannelId = channels.length > 0 ? channels[0].id : null;
    const [activeChannelId, setActiveChannelId] = useState<number | null>(defaultChannelId);

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
    });

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

    useEffect(() => {
        const comboKey = `${activeChannelId ?? 'none'}:${activeLocaleId}`;
        if (visitedCombosRef.current.has(comboKey)) {
            return;
        }
        visitedCombosRef.current.add(comboKey);

        const params = new URLSearchParams();
        if (activeChannelId) params.set('channel_id', String(activeChannelId));
        params.set('locale_id', String(activeLocaleId));

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
            });
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
                                displayEmpty
                                value={activeChannelId ?? ''}
                                onChange={(e) => setActiveChannelId(e.target.value === '' ? null : Number(e.target.value))}
                                sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 160 }}
                            >
                                {channels.length === 0 && (
                                    <MenuItem value="">
                                        <em>No channels</em>
                                    </MenuItem>
                                )}
                                {channels.map((ch) => (
                                    <MenuItem key={ch.id} value={ch.id}>
                                        {ch.name || ch.code}
                                    </MenuItem>
                                ))}
                            </Select>
                            <Select
                                size="small"
                                value={activeLocaleId}
                                onChange={(e) => setActiveLocaleId(Number(e.target.value))}
                                sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 180 }}
                            >
                                {locales.map((loc) => (
                                    <MenuItem key={loc.id} value={loc.id}>
                                        {loc.display_name || loc.code}
                                    </MenuItem>
                                ))}
                            </Select>
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
                        <Grid item xs={12} md={8.5}>
                            <Stack spacing={3}>
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
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <KeyboardArrowRightIcon fontSize="small" sx={{ color: '#64748b' }} />
                                        <Typography variant="body2" color="#334155">
                                            [root]
                                        </Typography>
                                    </Stack>
                                </Paper>

                                {/* Associations Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                        Associations
                                    </Typography>

                                    <Stack spacing={2.5}>
                                        {/* Related Products */}
                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                                    Related Products
                                                </Typography>
                                                <Button size="small" variant="outlined" sx={{ color: 'primary.main', borderColor: 'primary.main', py: 0.2, px: 1, minWidth: 'auto', textTransform: 'none' }}>
                                                    Add
                                                </Button>
                                            </Stack>
                                            <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1.5, p: 2, textAlign: 'center' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    Add Product
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">
                                                    Add related association products.
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Up-Sell Products */}
                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                                    Up-Sell Products
                                                </Typography>
                                                <Button size="small" variant="outlined" sx={{ color: 'primary.main', borderColor: 'primary.main', py: 0.2, px: 1, minWidth: 'auto', textTransform: 'none' }}>
                                                    Add
                                                </Button>
                                            </Stack>
                                            <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1.5, p: 2, textAlign: 'center' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    Add Product
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">
                                                    Add up sell association products.
                                                </Typography>
                                            </Box>
                                        </Box>

                                        {/* Cross-Sell Products */}
                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                <Typography variant="caption" fontWeight={600} color="text.secondary">
                                                    Cross-Sell Products
                                                </Typography>
                                                <Button size="small" variant="outlined" sx={{ color: 'primary.main', borderColor: 'primary.main', py: 0.2, px: 1, minWidth: 'auto', textTransform: 'none' }}>
                                                    Add
                                                </Button>
                                            </Stack>
                                            <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1.5, p: 2, textAlign: 'center' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    Add Product
                                                </Typography>
                                                <Typography variant="caption" color="text.disabled">
                                                    Add cross sell association products.
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Stack>
                        </Grid>
                    </Grid>
                </Box>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/products/${product.id}/history`} />}
            </Box>
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
        return (
            <FormControl fullWidth size="small">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Select displayEmpty value={stringValue} onChange={(e) => onChange(e.target.value)}>
                    <MenuItem value="">
                        <em>Select option</em>
                    </MenuItem>
                    {attr.options?.map((opt) => (
                        <MenuItem key={opt.id} value={opt.code || opt.admin_label || String(opt.id)}>
                            {opt.admin_label || opt.code}
                        </MenuItem>
                    ))}
                </Select>
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
            }
        }

        return (
            <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="#334155">
                        {label} {attr.is_required && '*'}
                    </Typography>
                    {renderChips()}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
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
