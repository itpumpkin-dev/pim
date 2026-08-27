import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/CloudUpload';
import {
    Box,
    Button,
    CircularProgress,
    FormControl,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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
        // เหตุผลเดียวกับหน้า edit ของ CategoryController ที่ PUT ส่ง multipart ไม่ได้ —
        // พอมีอัปโหลดรูป thumbnail ก็เลยต้องบังคับใช้ multipart แทน
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
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editBrand')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/brands" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
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

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('slug')}
                            htmlFor="brand-slug"
                            valueState={valueStateOf(errors.slug)}
                            message={errors.slug}
                            hint={t('slugHelperText')}
                        >
                            <TextField
                                id="brand-slug"
                                fullWidth
                                size="small"
                                value={data.slug}
                                onChange={(e) => setData('slug', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.slug))}
                            />
                        </FioriField>

                        <FioriField
                            label={t('parentBrand')}
                            htmlFor="brand-parent"
                            valueState={valueStateOf(errors.parent_id)}
                            message={errors.parent_id}
                            hint={t('parentBrandHelperText')}
                        >
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.parent_id))}>
                                <Select
                                    id="brand-parent"
                                    displayEmpty
                                    value={data.parent_id}
                                    onChange={(e) => setData('parent_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('noneOption')}</MenuItem>
                                    {parentOptions.map((opt) => (
                                        <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField
                            label={t('description')}
                            htmlFor="brand-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            hint={t('descriptionHelperText')}
                            fullWidth
                        >
                            <TextField
                                id="brand-description"
                                fullWidth
                                size="small"
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.description))}
                            />
                        </FioriField>

                        <FioriField label={t('imageLabel')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={fioriDefaultSx}>
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
                        </FioriField>
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
