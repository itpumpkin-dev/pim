import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
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
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AttributeFamily {
    id: number;
    code: string;
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
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
    [key: string]: any;
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
    });

    const [configModalOpen, setConfigModalOpen] = useState(false);

    // Filter potential configurable attributes (e.g. Color, Size, Brand)
    const selectedAttributeObjects = attributes.filter((attr) =>
        data.configurable_attributes.includes(attr.id)
    );

    const handleFormSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();

        // If configurable and modal not opened yet, we can open modal first or submit
        if (data.type === 'configurable' && !configModalOpen) {
            setConfigModalOpen(true);
            return;
        }

        post('/catalog/products');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductTitle')} />
            <Box component="form" onSubmit={handleFormSubmit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 900, mx: 'auto' }}>
                <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
                    {t('createProductTitle')}
                </Typography>

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 1 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                        {t('productInfo')}
                    </Typography>

                    <Stack spacing={3}>
                        {/* Status Checkboxes */}
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

                        {/* Family Dropdown */}
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
                                        {fam.code}
                                    </MenuItem>
                                ))}
                            </Select>
                            {errors.family_id && <FormHelperText>{errors.family_id}</FormHelperText>}
                        </FormControl>

                        {/* Product Types Dropdown */}
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
                                    }
                                }}
                            >
                                <MenuItem value="simple">{t('simple')}</MenuItem>
                                <MenuItem value="configurable">{t('configurable')}</MenuItem>
                            </Select>
                            {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                        </FormControl>

                        {/* SKU Input */}
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

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctErrorsBeforeSaving')}
                    </Alert>
                )}

                {/* Bottom Actions */}
                <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mt: 3 }}>
                    <Button
                        component={Link}
                        href="/catalog/products"
                        variant="contained"
                        sx={{ bgcolor: '#000', color: '#fff', '&:hover': { bgcolor: '#222' }, fontWeight: 700 }}
                    >
                        {t('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={processing}
                        sx={{ bgcolor: '#000', color: '#fff', '&:hover': { bgcolor: '#222' }, fontWeight: 700 }}
                    >
                        {t('save')}
                    </Button>
                </Stack>
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
                        options={attributes}
                        getOptionLabel={(option) => option.name || option.code}
                        value={selectedAttributeObjects}
                        onChange={(_, newValue) => {
                            setData(
                                'configurable_attributes',
                                newValue.map((item) => item.id)
                            );
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
                        onClick={() => {
                            setConfigModalOpen(false);
                            post('/catalog/products');
                        }}
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
                        {t('saveProduct')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
