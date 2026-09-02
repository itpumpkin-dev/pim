import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface Props {
    categories: { id: number; name: string }[];
    subcategories: { id: number; name: string; parent_id: number }[];
    businessTypes: { id: number; name: string }[];
    defaultCategoryId: number | null;
    defaultSubcategoryId: number | null;
}

export default function ProductGroupCreate({
    categories = [],
    subcategories = [],
    businessTypes = [],
    defaultCategoryId = null,
    defaultSubcategoryId = null,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
        { title: t('createProductGroup'), href: '/catalog/product-groups/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        code: '',
        description: '',
        category_id: (defaultCategoryId ?? '') as number | '',
        subcategory_id: (defaultSubcategoryId ?? '') as number | '',
        business_type_id: '' as number | '',
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const subcategoryOptions = useMemo(
        () => (data.category_id === '' ? [] : subcategories.filter((s) => s.parent_id === data.category_id)),
        [subcategories, data.category_id],
    );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/product-groups', {
            onSuccess: () => router.visit('/catalog/product-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductGroup')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ sm: 'center' }}
                    spacing={2}
                    sx={{ mb: 3 }}
                >
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('createProductGroup')}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/product-groups" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            sx={fioriEmphasizedSx}
                        >
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <LocaleLabelFields
                        title={t('productGroupName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('code')}
                            htmlFor="pg-code"
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                            hint={t('categoryCodeHelperText')}
                        >
                            <TextField
                                id="pg-code"
                                fullWidth
                                size="small"
                                value={data.code}
                                onChange={(e) => setData('code', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.code))}
                            />
                        </FioriField>

                        <FioriField label={t('category')} valueState={valueStateOf(errors.category_id)} message={errors.category_id}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.category_id))}>
                                <Select
                                    id="pg-category"
                                    displayEmpty
                                    value={data.category_id === '' ? '' : String(data.category_id)}
                                    onChange={(e) => {
                                        const next = e.target.value === '' ? '' : Number(e.target.value);
                                        setData((prev) => ({ ...prev, category_id: next, subcategory_id: '' }));
                                    }}
                                >
                                    <MenuItem value="">{t('selectCategory')}</MenuItem>
                                    {categories.map((c) => (
                                        <MenuItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('subcategory')} valueState={valueStateOf(errors.subcategory_id)} message={errors.subcategory_id}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.subcategory_id))}>
                                <Select
                                    id="pg-subcategory"
                                    displayEmpty
                                    disabled={data.category_id === ''}
                                    value={data.subcategory_id === '' ? '' : String(data.subcategory_id)}
                                    onChange={(e) => setData('subcategory_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{data.category_id === '' ? t('selectCategoryFirst') : t('selectSubcategory')}</MenuItem>
                                    {subcategoryOptions.map((s) => (
                                        <MenuItem key={s.id} value={String(s.id)}>
                                            {s.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField
                            label={t('businessTypeName')}
                            valueState={valueStateOf(errors.business_type_id)}
                            message={errors.business_type_id}
                        >
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.business_type_id))}>
                                <Select
                                    id="pg-business-type"
                                    displayEmpty
                                    value={data.business_type_id === '' ? '' : String(data.business_type_id)}
                                    onChange={(e) => setData('business_type_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('selectBusinessType')}</MenuItem>
                                    {businessTypes.map((b) => (
                                        <MenuItem key={b.id} value={String(b.id)}>
                                            {b.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField
                            label={t('description')}
                            htmlFor="pg-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            fullWidth
                        >
                            <TextField
                                id="pg-description"
                                fullWidth
                                size="small"
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.description))}
                            />
                        </FioriField>

                        <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={fioriDefaultSx}>
                                    {t('chooseFile')}
                                    <input type="file" hidden accept="image/*" onChange={(e) => setData('thumbnail', e.target.files?.[0] ?? null)} />
                                </Button>
                                {data.thumbnail && (
                                    <Typography variant="body2" color="text.secondary">
                                        {data.thumbnail.name}
                                    </Typography>
                                )}
                            </Stack>
                        </FioriField>

                        <FioriField label="">
                            <Stack>
                                <FormControlLabel
                                    control={
                                        <Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />
                                    }
                                    label={t('aiTranslate')}
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                    label={t('active')}
                                />
                            </Stack>
                        </FioriField>
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
