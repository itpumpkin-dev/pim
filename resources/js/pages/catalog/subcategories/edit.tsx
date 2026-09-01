import { HistoryPanel } from '@/components/history-panel';
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
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx, fioriTabsSx } from '@/lib/fiori-style';

interface SubcategoryData {
    id: number;
    code: string;
    description: string | null;
    is_active: boolean;
    is_ai_translate: boolean;
    category_id: number | null;
}

interface Props {
    subcategory: SubcategoryData;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categories: { id: number; name: string }[];
    canViewHistory?: boolean;
}

export default function SubcategoryEdit({ subcategory, thumbnailUrl, translations, categories = [], canViewHistory = false }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('subCategories'), href: '/catalog/subcategories' },
        { title: t('editSubcategory'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(subcategory.is_ai_translate),
        code: subcategory.code || '',
        description: subcategory.description || '',
        category_id: (subcategory.category_id ?? '') as number | '',
        thumbnail: null as File | null,
        is_active: Boolean(subcategory.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/subcategories/${subcategory.id}`, {
            onSuccess: () => router.visit('/catalog/subcategories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editSubcategory')}: ${subcategory.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                {canViewHistory && (
                    <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ ...fioriTabsSx, mb: 3 }}>
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/subcategories/${subcategory.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                            <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                {t('editSubcategory')}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Button component={Link} href="/catalog/subcategories" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
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
                                title={t('subcategoryName')}
                                description={t('nameHelperText')}
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />

                            <FioriFormGroup title={t('generalTitle')}>
                                <FioriField label={t('code')} htmlFor="sub-code" hint={t('codeLockedHelperText')}>
                                    <TextField id="sub-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
                                </FioriField>

                                <FioriField label={t('category')} valueState={valueStateOf(errors.category_id)} message={errors.category_id}>
                                    <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.category_id))}>
                                        <Select
                                            id="sub-category"
                                            displayEmpty
                                            value={data.category_id === '' ? '' : String(data.category_id)}
                                            onChange={(e) => setData('category_id', e.target.value === '' ? '' : Number(e.target.value))}
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

                                <FioriField
                                    label={t('description')}
                                    htmlFor="sub-description"
                                    valueState={valueStateOf(errors.description)}
                                    message={errors.description}
                                    fullWidth
                                >
                                    <TextField
                                        id="sub-description"
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
                                        {data.thumbnail ? (
                                            <Typography variant="body2" color="text.secondary">
                                                {data.thumbnail.name}
                                            </Typography>
                                        ) : thumbnailUrl ? (
                                            <Box component="img" src={thumbnailUrl} alt="" sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 1 }} />
                                        ) : null}
                                    </Stack>
                                </FioriField>

                                <FioriField label="">
                                    <Stack>
                                        <FormControlLabel
                                            control={<Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />}
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
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
