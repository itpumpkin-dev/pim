import { HistoryPanel } from '@/components/history-panel';
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
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';
import { CategoryParentTreePicker } from '@/components/category-parent-tree-picker';
import { LazadaCategoryPicker, type LazadaCategoryOption } from '@/components/catalog/lazada-category-picker';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    slug: string | null;
    display_type: 'default' | 'products' | 'subcategories' | 'both';
    description: string | null;
    is_ai_translate: boolean;
    is_active: boolean;
    parent_id: number | null;
    additional_data: Record<string, any> | null;
    lazada_category_id: number | null;
    lazada_category: LazadaCategoryOption | null;
}

interface Props {
    category: CategoryItem;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categoryFields: CategoryFieldItem[];
    canViewHistory?: boolean;
}

export default function CategoryEdit({ category, thumbnailUrl, translations, categoryFields = [], canViewHistory = false }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);
    const { locales, locale: currentLocaleCode } = useLocale();
    const currentLocaleId = locales.find((l) => l.code === currentLocaleCode)?.id || 1;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: t('editCategory'), href: '#' },
    ];

    const [lazadaCategory, setLazadaCategory] = useState<LazadaCategoryOption | null>(category.lazada_category);

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        code: category.code || '',
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(category.is_ai_translate),
        description: category.description || '',
        parent_id: (category.parent_id !== null ? category.parent_id : '') as string | number,
        lazada_category_id: category.lazada_category_id,
        additional_data: (category.additional_data || {}) as Record<string, any>,
        slug: category.slug || '',
        display_type: category.display_type || 'default',
        thumbnail: null as File | null,
        is_active: Boolean(category.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        // PHP does not parse multipart/form-data bodies for PUT requests, so
        // saving must go through POST with a spoofed _method — Image/File
        // category fields put a raw File into additional_data, which forces
        // this request into multipart.
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/categories/${category.id}`, {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editCategory')}: ${category.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', bgcolor: FIORI.pageBg }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categories/${category.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editCategory')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/categories" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
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

                    <Paper sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('generalTitle')}</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label={t('code')}
                                fullWidth
                                value={data.code}
                                disabled
                                helperText={t('codeLockedHelperText')}
                            />
                            <TextField
                                label={t('slug')}
                                fullWidth
                                value={data.slug}
                                onChange={(e) => setData('slug', e.target.value)}
                                error={Boolean(errors.slug)}
                                helperText={errors.slug || t('slugHelperText')}
                            />
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {t('parentCategory')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                    {t('parentCategoryHelperText')}
                                </Typography>
                                <CategoryParentTreePicker
                                    value={typeof data.parent_id === 'number' ? data.parent_id : ''}
                                    onChange={(id) => setData('parent_id', id)}
                                    excludeId={category.id}
                                    rootLabel={t('rootCategory')}
                                />
                                {errors.parent_id && <Alert severity="error" sx={{ mt: 1 }}>{errors.parent_id}</Alert>}
                            </Box>
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
                            <FormControl fullWidth>
                                <InputLabel id="category-display-type-label">{t('displayType')}</InputLabel>
                                <Select
                                    labelId="category-display-type-label"
                                    label={t('displayType')}
                                    value={data.display_type}
                                    onChange={(e) => setData('display_type', e.target.value as typeof data.display_type)}
                                >
                                    <MenuItem value="default">{t('displayTypeDefault')}</MenuItem>
                                    <MenuItem value="products">{t('displayTypeProducts')}</MenuItem>
                                    <MenuItem value="subcategories">{t('displayTypeSubcategories')}</MenuItem>
                                    <MenuItem value="both">{t('displayTypeBoth')}</MenuItem>
                                </Select>
                            </FormControl>
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {t('thumbnail')}
                                </Typography>
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
                                    ) : thumbnailUrl ? (
                                        <Box component="img" src={thumbnailUrl} alt="" sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 1 }} />
                                    ) : null}
                                </Stack>
                                {errors.thumbnail && <Alert severity="error" sx={{ mt: 1 }}>{errors.thumbnail}</Alert>}
                            </Box>
                            <FormControlLabel
                                control={<Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />}
                                label={t('aiTranslate')}
                            />
                            <FormControlLabel
                                control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                label={t('active')}
                            />
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                                    {t('lazadaCategoryLabel')}
                                </Typography>
                                <LazadaCategoryPicker
                                    value={lazadaCategory}
                                    onChange={(next) => {
                                        setLazadaCategory(next);
                                        setData('lazada_category_id', next?.id ?? null);
                                    }}
                                    placeholder={t('lazadaCategoryPlaceholder')}
                                />
                                {errors.lazada_category_id && <Alert severity="error" sx={{ mt: 1 }}>{errors.lazada_category_id}</Alert>}
                            </Box>
                        </Stack>
                    </Paper>

                    {categoryFields.length > 0 && (
                        <Paper sx={{ ...fioriCardSx, p: 3 }}>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>หมวดหมู่แอตทริบิวต์เพิ่มเติม (Dynamic Fields)</Typography>
                            <Stack spacing={3}>
                                {categoryFields.map((field) => {
                                    const fieldLabel = field.labels[currentLocaleId] || Object.values(field.labels)[0] || field.code;
                                    const fieldValue = data.additional_data[field.code] ?? '';
                                    const fieldError = errors[`additional_data.${field.code}` as keyof typeof errors];

                                    return (
                                        <Box key={field.id}>
                                            <Typography variant="caption" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 0.5, display: 'block' }}>
                                                {fieldLabel} {field.is_required && '*'}
                                            </Typography>
                                            <CategoryFieldInput
                                                field={field}
                                                value={fieldValue}
                                                onChange={(value) => setData('additional_data', { ...data.additional_data, [field.code]: value })}
                                                error={fieldError}
                                            />
                                        </Box>
                                    );
                                })}
                            </Stack>
                        </Paper>
                    )}
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctHighlightedFields')}
                    </Alert>
                )}
                </>
                )}
            </Box>
        </AppLayout>
    );
}
