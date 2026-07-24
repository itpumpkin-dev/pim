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
} from '@mui/material';
import { FormEvent, useState } from 'react';
import RichTextEditor from '@/components/rich-text-editor';
import { useLocale } from '@/hooks/use-locale';

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

interface Props {
    product: Product;
    families: AttributeFamily[];
    assignedGroups: GroupWithAttributes[];
    productValues: Record<number | string, string>;
}

type AttributeValue = string | File | File[];

interface ProductForm {
    sku: string;
    family_id: number;
    type: string;
    enabled: boolean;
    values: Record<string | number, AttributeValue>;
    [key: string]: any;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'PRODUCTS', href: '/catalog/products' },
    { title: 'EDIT PRODUCT', href: '#' },
];

export default function ProductEdit({ product, families, assignedGroups, productValues }: Props) {
    const { locales, locale: currentLocaleCode } = useLocale();
    const [tabIndex, setTabIndex] = useState(0);

    // Find active locale ID matching system language
    const defaultLocale = locales.find((l) => l.code === currentLocaleCode) || locales[0];
    const [activeLocaleId, setActiveLocaleId] = useState<number>(defaultLocale ? defaultLocale.id : 1);

    // Collect initial values for all real attributes
    const initialValues: Record<string, Record<string | number, any>> = {};
    assignedGroups.forEach((group) => {
        group.attributes.forEach((attr) => {
            initialValues[attr.id] = (productValues[attr.id] as any) || (attr.is_locale_based ? {} : { default: '' });
        });
    });

    const { data, setData, post, transform, processing, errors } = useForm<ProductForm>({
        sku: product.sku || '',
        family_id: product.family_id,
        type: product.type || 'simple',
        enabled: Boolean(product.enabled),
        values: initialValues,
    });

    const handleAttributeChange = (attributeId: number, val: AttributeValue, isLocaleBased: boolean) => {
        const key = isLocaleBased ? activeLocaleId : 'default';
        setData('values', {
            ...data.values,
            [attributeId]: {
                ...(data.values[attributeId] || {}),
                [key]: val,
            },
        });
    };

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
            <Box component="form" onSubmit={submit} sx={{ bgcolor: '#fbfbfe', minHeight: '100vh', pb: 6 }}>
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
                        <Tab label="History" />
                    </Tabs>
                </Box>

                {/* Sub-Header Toolbar */}
                <Box sx={{ px: { xs: 2, md: 4 }, py: 2.5, bgcolor: '#fff', borderBottom: '1px solid #f1f5f9', mb: 3 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                        <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                            Edit Product | SKU: {data.sku}
                        </Typography>

                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Select size="small" defaultValue="default" sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 120 }}>
                                <MenuItem value="default">Default</MenuItem>
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
                <Box sx={{ px: { xs: 2, md: 4 } }}>
                    <Grid container spacing={3}>
                        {/* Left Main Area: Real Attribute Groups from Database */}
                        <Grid item xs={12} md={8.5}>
                            <Stack spacing={3}>
                                {/* General Card containing SKU and real General Attributes */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2.5 }}>
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
                                            .map((attr) => {
                                                const valKey = attr.is_locale_based ? activeLocaleId : 'default';
                                                const val = data.values[attr.id]?.[valKey] || '';
                                                const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                return (
                                                    <RenderAttributeInput
                                                        key={attr.id}
                                                        attr={attr}
                                                        value={val}
                                                        onChange={(newVal) => handleAttributeChange(attr.id, newVal, attr.is_locale_based)}
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
                                            <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2.5 }}>
                                                {group.name}
                                            </Typography>
                                            <Stack spacing={2.5}>
                                                {group.attributes.length === 0 ? (
                                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                        No attributes assigned to this group yet.
                                                    </Typography>
                                                ) : (
                                                     group.attributes.map((attr) => {
                                                         const valKey = attr.is_locale_based ? activeLocaleId : 'default';
                                                         const val = data.values[attr.id]?.[valKey] || '';
                                                         const activeLocaleCode = locales.find((l) => l.id === activeLocaleId)?.code || 'en';
                                                         return (
                                                             <RenderAttributeInput
                                                                 key={attr.id}
                                                                 attr={attr}
                                                                 value={val}
                                                                 onChange={(newVal) => handleAttributeChange(attr.id, newVal, attr.is_locale_based)}
                                                                 activeLocaleCode={activeLocaleCode}
                                                             />
                                                         );
                                                     })
                                                )}
                                            </Stack>
                                        </Paper>
                                    ))}
                            </Stack>
                        </Grid>

                        {/* Right Sidebar */}
                        <Grid item xs={12} md={3.5}>
                            <Stack spacing={3}>
                                {/* Product Info Panel */}
                                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                    <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
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
                                    <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
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
                                    <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
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
                        sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#e2e8f0', color: '#475569', fontWeight: 600 }}
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
