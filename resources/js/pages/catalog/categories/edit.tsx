import { HistoryPanel } from '@/components/history-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/hooks/use-locale';
import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    description: string | null;
    parent_id: number | null;
    additional_data: Record<string, any> | null;
}

interface ParentCategoryOption {
    id: number;
    code: string;
    name: string;
    display_name: string;
}

interface Props {
    category: CategoryItem;
    parentCategories: ParentCategoryOption[];
    categoryFields: CategoryFieldItem[];
    canViewHistory?: boolean;
}

export default function CategoryEdit({ category, parentCategories, categoryFields = [], canViewHistory = false }: Props) {
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

    const { data, setData, put, processing, errors } = useForm({
        code: category.code || '',
        name: category.name || '',
        description: category.description || '',
        parent_id: (category.parent_id !== null ? category.parent_id : '') as string | number,
        additional_data: (category.additional_data || {}) as Record<string, any>,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        put(`/catalog/categories/${category.id}`, {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editCategory')}: ${category.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categories/${category.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('editCategory')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/categories" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button sx={{ color: "white" }} type="submit" variant="contained" disabled={processing} startIcon={<SaveIcon />}>
                            {t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('generalTitle')}</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label={t('name') + ' *'}
                                required
                                fullWidth
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                error={Boolean(errors.name)}
                                helperText={errors.name}
                            />
                            <TextField
                                label={t('code') + ' *'}
                                required
                                fullWidth
                                value={data.code}
                                onChange={(e) =>
                                    setData(
                                        'code',
                                        e.target.value
                                            .toLowerCase()
                                            .replace(/\s+/g, '_')
                                            .replace(/[^a-z0-9_]/g, ''),
                                    )
                                }
                                error={Boolean(errors.code)}
                                helperText={errors.code ?? t('codeHelperText')}
                            />
                            <FormControl fullWidth error={Boolean(errors.parent_id)}>
                                <InputLabel id="parent-category-label">{t('parentCategory')}</InputLabel>
                                <Select
                                    labelId="parent-category-label"
                                    label={t('parentCategory')}
                                    value={data.parent_id}
                                    onChange={(e) => setData('parent_id', e.target.value)}
                                >
                                    <MenuItem value="">
                                        <em>{t('rootCategory')}</em>
                                    </MenuItem>
                                    {parentCategories.map((cat) => (
                                        <MenuItem key={cat.id} value={cat.id}>
                                            {cat.display_name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.parent_id && <Alert severity="error" sx={{ mt: 1 }}>{errors.parent_id}</Alert>}
                            </FormControl>
                            <TextField
                                label={t('description')}
                                fullWidth
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                error={Boolean(errors.description)}
                                helperText={errors.description}
                            />
                        </Stack>
                    </Paper>

                    {categoryFields.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>หมวดหมู่แอตทริบิวต์เพิ่มเติม (Dynamic Fields)</Typography>
                            <Stack spacing={3}>
                                {categoryFields.map((field) => {
                                    const fieldLabel = field.labels[currentLocaleId] || Object.values(field.labels)[0] || field.code;
                                    const fieldValue = data.additional_data[field.code] ?? '';
                                    const fieldError = errors[`additional_data.${field.code}` as keyof typeof errors];

                                    return (
                                        <Box key={field.id}>
                                            <Typography variant="caption" fontWeight={600} color="#334155" sx={{ mb: 0.5, display: 'block' }}>
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
