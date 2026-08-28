import { HistoryPanel } from '@/components/history-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadIcon from '@mui/icons-material/CloudUpload';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    IconButton,
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

import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FIORI, FioriStatus, fioriDefaultSx, fioriEmphasizedSx, fioriIconButtonSx } from '@/lib/fiori-style';

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
}

interface SubcategoryItem {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
}

interface Props {
    category: CategoryItem;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categoryFields: CategoryFieldItem[];
    rootCategories: { id: number; name: string }[];
    subcategories: SubcategoryItem[];
    canViewHistory?: boolean;
}

export default function CategoryEdit({
    category,
    thumbnailUrl,
    translations,
    categoryFields = [],
    rootCategories = [],
    subcategories = [],
    canViewHistory = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);
    const { locales, locale: currentLocaleCode } = useLocale();
    const currentLocaleId = locales.find((l) => l.code === currentLocaleCode)?.id || 1;

    const isRoot = category.parent_id === null;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: t('editCategory'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        code: category.code || '',
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(category.is_ai_translate),
        description: category.description || '',
        parent_id: (category.parent_id !== null ? category.parent_id : '') as string | number,
        additional_data: (category.additional_data || {}) as Record<string, any>,
        slug: category.slug || '',
        display_type: category.display_type || 'default',
        thumbnail: null as File | null,
        is_active: Boolean(category.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        // PHP มันไม่รองรับการอ่าน multipart/form-data ตอนเป็น PUT request
        // เลยต้องส่งผ่าน POST แล้วปลอมเป็น _method แทน — เพราะฟิลด์ประเภท Image/File
        // ของหมวดหมู่จะยัด File ดิบๆ ลงใน additional_data ทำให้ request นี้ต้องเป็น multipart
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/categories/${category.id}`, {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const subcategoryColumns: FioriResponsiveColumn<SubcategoryItem>[] = [
        {
            key: 'status',
            header: t('status'),
            priority: 'always',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'name',
            header: t('subcategoryNameColumn'),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.name}</Typography>,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.code || '-'}</Typography>,
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/categories/${row.id}/edit`)}>
                    <EditIcon fontSize="small" />
                </IconButton>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editCategory')}: ${category.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                {canViewHistory && (
                    <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}>
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categories/${category.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            justifyContent="space-between"
                            alignItems={{ sm: 'center' }}
                            spacing={2}
                            sx={{ mb: 3 }}
                        >
                            <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                {t('editCategory')}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    component={Link}
                                    href="/catalog/categories"
                                    variant="outlined"
                                    startIcon={<ArrowBackIcon />}
                                    sx={fioriDefaultSx}
                                >
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
                                title={t('name')}
                                description={t('nameHelperText')}
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />

                            <FioriFormGroup title={t('generalTitle')}>
                                <FioriField label={t('code')} htmlFor="category-code" hint={t('codeLockedHelperText')}>
                                    <TextField id="category-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
                                </FioriField>

                                <FioriField
                                    label={t('slug')}
                                    htmlFor="category-slug"
                                    valueState={valueStateOf(errors.slug)}
                                    message={errors.slug}
                                    hint={t('slugHelperText')}
                                >
                                    <TextField
                                        id="category-slug"
                                        fullWidth
                                        size="small"
                                        value={data.slug}
                                        onChange={(e) => setData('slug', e.target.value)}
                                        sx={fioriFieldStateSx(valueStateOf(errors.slug))}
                                    />
                                </FioriField>

                                <FioriField
                                    label={t('parentCategory')}
                                    valueState={valueStateOf(errors.parent_id)}
                                    message={errors.parent_id}
                                    hint={t('categoryParentHelperText')}
                                >
                                    <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.parent_id))}>
                                        <Select
                                            id="category-parent"
                                            displayEmpty
                                            value={data.parent_id === '' ? '' : String(data.parent_id)}
                                            onChange={(e) => setData('parent_id', e.target.value === '' ? '' : Number(e.target.value))}
                                        >
                                            <MenuItem value="">{t('noneRootCategory')}</MenuItem>
                                            {rootCategories.map((c) => (
                                                <MenuItem key={c.id} value={String(c.id)}>
                                                    {c.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </FioriField>

                                <FioriField
                                    label={t('description')}
                                    htmlFor="category-description"
                                    valueState={valueStateOf(errors.description)}
                                    message={errors.description}
                                    hint={t('descriptionHelperText')}
                                    fullWidth
                                >
                                    <TextField
                                        id="category-description"
                                        fullWidth
                                        size="small"
                                        multiline
                                        rows={4}
                                        value={data.description}
                                        onChange={(e) => setData('description', e.target.value)}
                                        sx={fioriFieldStateSx(valueStateOf(errors.description))}
                                    />
                                </FioriField>

                                <FioriField label={t('displayType')} htmlFor="category-display-type">
                                    <FormControl fullWidth size="small" sx={fioriFieldStateSx('none')}>
                                        <Select
                                            id="category-display-type"
                                            value={data.display_type}
                                            onChange={(e) => setData('display_type', e.target.value as typeof data.display_type)}
                                        >
                                            <MenuItem value="default">{t('displayTypeDefault')}</MenuItem>
                                            <MenuItem value="products">{t('displayTypeProducts')}</MenuItem>
                                            <MenuItem value="subcategories">{t('displayTypeSubcategories')}</MenuItem>
                                            <MenuItem value="both">{t('displayTypeBoth')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                </FioriField>

                                <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
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
                                            <Typography variant="body2" color="text.secondary">
                                                {data.thumbnail.name}
                                            </Typography>
                                        ) : thumbnailUrl ? (
                                            <Box
                                                component="img"
                                                src={thumbnailUrl}
                                                alt=""
                                                sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 1 }}
                                            />
                                        ) : null}
                                    </Stack>
                                </FioriField>

                                <FioriField label="">
                                    <Stack>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={data.is_ai_translate}
                                                    onChange={(e) => setData('is_ai_translate', e.target.checked)}
                                                />
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

                            <FioriFormGroup title={t('subcategoriesColumn')}>
                                <Stack spacing={1.5}>
                                    {isRoot && (
                                        <Box>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<AddIcon />}
                                                onClick={() => router.visit(`/catalog/categories/create?parent=${category.id}`)}
                                                sx={fioriDefaultSx}
                                            >
                                                {t('createSubcategory')}
                                            </Button>
                                        </Box>
                                    )}
                                    {subcategories.length > 0 ? (
                                        <FioriResponsiveTable
                                            variant="plain"
                                            size="small"
                                            columns={subcategoryColumns}
                                            rows={subcategories}
                                            getRowKey={(row) => row.id}
                                        />
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            {t('noSubcategories')}
                                        </Typography>
                                    )}
                                </Stack>
                            </FioriFormGroup>

                            {categoryFields.length > 0 && (
                                <FioriFormGroup title="หมวดหมู่แอตทริบิวต์เพิ่มเติม (Dynamic Fields)">
                                    {categoryFields.map((field) => {
                                        const fieldLabel = field.labels[currentLocaleId] || Object.values(field.labels)[0] || field.code;
                                        const fieldValue = data.additional_data[field.code] ?? '';
                                        const fieldError = errors[`additional_data.${field.code}` as keyof typeof errors];

                                        return (
                                            <FioriField
                                                key={field.id}
                                                label={fieldLabel}
                                                required={field.is_required}
                                                valueState={valueStateOf(fieldError)}
                                                message={fieldError}
                                            >
                                                <CategoryFieldInput
                                                    field={field}
                                                    value={fieldValue}
                                                    onChange={(value) => setData('additional_data', { ...data.additional_data, [field.code]: value })}
                                                    error={fieldError}
                                                />
                                            </FioriField>
                                        );
                                    })}
                                </FioriFormGroup>
                            )}
                        </Stack>

                        <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
