import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormHelperText,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AttributeFamily {
    id: number;
    code: string;
    name: string;
}

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
    options?: AttributeOption[];
}

interface Props {
    families: AttributeFamily[];
    attributes: AttributeItem[];
}

interface ProductForm {
    enabled: boolean;
    family_id: string | number;
    type: string;
    sku: string;
    configurable_attributes: number[];
    variants: {
        sku: string;
        price: string;
        qty: string;
        attributes: Record<number, string>;
        label: string;
    }[];
}

function cartesian(sets: any[][]): any[][] {
    return sets.reduce((acc, set) => acc.flatMap(x => set.map(y => [...x, y])), [[]]);
}

export default function ProductCreate({ families, attributes }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('products'), href: '/catalog/products' },
        { title: t('createProduct'), href: '/catalog/products/create' },
    ];

    const { data, setData, post, processing, errors } = useForm<ProductForm>({
        enabled: true,
        family_id: families.length > 0 ? families[0].id : '',
        type: 'simple',
        sku: '',
        configurable_attributes: [],
        variants: [],
    });

    const [configModalOpen, setConfigModalOpen] = useState(false);

    // Filter dynamic attributes that have options (e.g. Color, Size)
    const selectedAttributeObjects = attributes.filter((attr) =>
        data.configurable_attributes.includes(attr.id)
    );

    const handleGenerateVariants = (selectedAttrIds: number[]) => {
        const selectedAttrs = attributes.filter((attr) =>
            selectedAttrIds.includes(attr.id)
        );

        const optionSets = selectedAttrs.map((attr) => {
            return (attr.options || []).map((opt) => ({
                attribute_id: attr.id,
                attribute_code: attr.code,
                option_id: opt.id,
                option_code: opt.code || opt.admin_label || String(opt.id),
                label: opt.admin_label || opt.code || String(opt.id),
            }));
        });

        if (optionSets.length === 0) {
            setData((prev) => ({ ...prev, variants: [] }));
            return;
        }

        const combos = cartesian(optionSets);
        const generated = combos.map((combo) => {
            const suffix = combo.map((c) => String(c.option_code).toUpperCase()).join('-');
            const varSku = data.sku ? `${data.sku}-${suffix}` : suffix;

            const combinationAttrs = combo.reduce((acc, c) => {
                acc[c.attribute_id] = c.option_code;
                return acc;
            }, {} as Record<number, string>);

            return {
                sku: varSku,
                price: '',
                qty: '',
                attributes: combinationAttrs,
                label: combo.map((c) => c.label).join(' / '),
            };
        });

        setData((prev) => ({
            ...prev,
            configurable_attributes: selectedAttrIds,
            variants: generated,
        }));
    };

    const handleVariantFieldChange = (index: number, field: 'sku' | 'price' | 'qty', value: string) => {
        const updated = [...data.variants];
        updated[index] = { ...updated[index], [field]: value };
        setData('variants', updated);
    };

    const handleFormSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();
        post('/catalog/products', {
            onSuccess: () => router.visit('/catalog/products', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductTitle')} />
            <Box component="form" onSubmit={handleFormSubmit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 1000, mx: 'auto' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700}>
                        {t('createProductTitle')}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/products" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button sx={{ color: "white" }} type="submit" variant="contained" disabled={processing} startIcon={<SaveIcon />}>
                            {t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3}>
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                            {t('productInfo')}
                        </Typography>

                        <Stack spacing={3}>
                            {/* Status */}
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                                    {t('status')}
                                </Typography>
                                <Stack direction="row" spacing={3}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={data.enabled === true}
                                                onChange={() => setData('enabled', true)}
                                            />
                                        }
                                        label={t('active')}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={data.enabled === false}
                                                onChange={() => setData('enabled', false)}
                                            />
                                        }
                                        label={t('nonActive')}
                                    />
                                </Stack>
                            </Box>

                            {/* Family */}
                            <FormControl fullWidth required error={Boolean(errors.family_id)}>
                                <InputLabel id="family-label">{t('familyRequired')}</InputLabel>
                                <Select
                                    labelId="family-label"
                                    label={t('familyRequired')}
                                    value={data.family_id}
                                    onChange={(e) => setData('family_id', e.target.value)}
                                >
                                    {families.map((fam) => (
                                        <MenuItem key={fam.id} value={fam.id}>
                                            {fam.name || fam.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.family_id && <FormHelperText>{errors.family_id}</FormHelperText>}
                            </FormControl>

                            {/* Product Type */}
                            <FormControl fullWidth required error={Boolean(errors.type)}>
                                <InputLabel id="product-type-label">{t('productTypesRequired')}</InputLabel>
                                <Select
                                    labelId="product-type-label"
                                    label={t('productTypesRequired')}
                                    value={data.type}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setData('type', val);
                                        if (val === 'configurable') {
                                            setConfigModalOpen(true);
                                        } else {
                                            setData('variants', []);
                                        }
                                    }}
                                >
                                    <MenuItem value="simple">{t('simple')}</MenuItem>
                                    <MenuItem value="configurable">{t('configurable')}</MenuItem>
                                </Select>
                                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                            </FormControl>

                            {/* Parent SKU */}
                            <TextField
                                label={t('skuRequired')}
                                required
                                fullWidth
                                value={data.sku}
                                onChange={(e) => setData('sku', e.target.value)}
                                placeholder={t('skuPlaceholder')}
                                error={Boolean(errors.sku)}
                                helperText={errors.sku}
                            />
                        </Stack>
                    </Paper>

                    {/* Cartesian Variants Table */}
                    {data.type === 'configurable' && data.variants.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 1.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                                <Typography variant="h6" fontWeight={700}>
                                    สร้างตัวเลือกสินค้าย่อย (Variants Cartesian List)
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => setConfigModalOpen(true)}
                                >
                                    เลือกคุณสมบัติย่อยเพิ่ม ({selectedAttributeObjects.length})
                                </Button>
                            </Stack>

                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>ตัวเลือกย่อย</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>SKU ย่อย *</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>ราคา</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>จำนวนสต๊อก (Qty)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {data.variants.map((variant, index) => (
                                            <TableRow key={index}>
                                                <TableCell sx={{ fontWeight: 600 }}>
                                                    {variant.label}
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        required
                                                        value={variant.sku}
                                                        onChange={(e) => handleVariantFieldChange(index, 'sku', e.target.value)}
                                                        error={Boolean(errors[`variants.${index}.sku` as keyof typeof errors])}
                                                        helperText={errors[`variants.${index}.sku` as keyof typeof errors]}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={variant.price}
                                                        onChange={(e) => handleVariantFieldChange(index, 'price', e.target.value)}
                                                        placeholder="ราคา"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        value={variant.qty}
                                                        onChange={(e) => handleVariantFieldChange(index, 'qty', e.target.value)}
                                                        placeholder="สต๊อก"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctErrorsBeforeSaving')}
                    </Alert>
                )}
            </Box>

            {/* Configurable Attributes Dialog */}
            <Dialog
                open={configModalOpen}
                onClose={() => setConfigModalOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 2 } }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={700}>
                        {t('configurableAttributesTitle')}
                    </Typography>
                    <IconButton onClick={() => setConfigModalOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    <Autocomplete
                        multiple
                        options={attributes.filter(attr => (attr.options || []).length > 0)}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedAttributeObjects}
                        onChange={(_, newValue) => {
                            const newIds = newValue.map((item) => item.id);
                            handleGenerateVariants(newIds);
                        }}
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
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder={t('selectAttributesPlaceholder')}
                                variant="outlined"
                            />
                        )}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                        onClick={() => setConfigModalOpen(false)}
                        sx={{ color: '#7e22ce', fontWeight: 700, textTransform: 'none' }}
                    >
                        {t('back')}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => setConfigModalOpen(false)}
                        sx={{
                            bgcolor: 'primary.main',
                            color: '#fff',
                            '&:hover': { bgcolor: 'primary.dark' },
                            fontWeight: 700,
                            borderRadius: 1.5,
                            px: 2.5,
                            textTransform: 'none',
                        }}
                    >
                        Save Configurations
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
