import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/CloudUpload';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';

interface BrandDetail {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    parent_id: number | null;
    thumbnail_url: string | null;
}

interface ParentOption {
    id: number;
    name: string | null;
}

interface Props {
    brand: BrandDetail;
    translations: Record<string, string>;
    parentOptions: ParentOption[];
}

export default function BrandEdit({ brand, translations, parentOptions }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
        { title: t('editBrand'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        slug: brand.slug || '',
        parent_id: (brand.parent_id !== null ? brand.parent_id : '') as string | number,
        description: brand.description || '',
        thumbnail: null as File | null,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        // Same PUT-can't-carry-multipart reasoning as CategoryController's
        // edit page — the thumbnail upload forces this into multipart.
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/brands/${brand.id}`, {
            onSuccess: () => router.visit('/catalog/brands', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editBrand')}: ${brand.admin_label || brand.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 640 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('editBrand')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/brands" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button sx={{ color: '#fff' }} type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <LocaleLabelFields
                        title={t('name')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('generalTitle')}</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label={t('slug')}
                                fullWidth
                                value={data.slug}
                                onChange={(e) => setData('slug', e.target.value)}
                                error={Boolean(errors.slug)}
                                helperText={errors.slug || t('slugHelperText')}
                            />
                            <FormControl fullWidth>
                                <InputLabel id="brand-parent-label">{t('parentBrand')}</InputLabel>
                                <Select
                                    labelId="brand-parent-label"
                                    label={t('parentBrand')}
                                    value={data.parent_id}
                                    onChange={(e) => setData('parent_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('noneOption')}</MenuItem>
                                    {parentOptions.map((opt) => (
                                        <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                                    ))}
                                </Select>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 1.5 }}>
                                    {t('parentBrandHelperText')}
                                </Typography>
                            </FormControl>
                            <TextField
                                label={t('description')}
                                fullWidth
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                error={Boolean(errors.description)}
                                helperText={errors.description || t('descriptionHelperText')}
                            />
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>{t('imageLabel')}</Typography>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
                                        {t('chooseFile')}
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={(e) => setData('thumbnail', e.target.files?.[0] ?? null)}
                                        />
                                    </Button>
                                    {data.thumbnail ? (
                                        <Typography variant="body2" color="text.secondary">{data.thumbnail.name}</Typography>
                                    ) : brand.thumbnail_url ? (
                                        <Box component="img" src={brand.thumbnail_url} alt="" sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 1 }} />
                                    ) : null}
                                </Stack>
                                {errors.thumbnail && <Alert severity="error" sx={{ mt: 1 }}>{errors.thumbnail}</Alert>}
                            </Box>
                        </Stack>
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctHighlightedFields')}
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
