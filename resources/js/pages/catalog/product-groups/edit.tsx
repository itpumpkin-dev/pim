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
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LazadaCategoryPicker, type LazadaCategoryOption } from '@/components/catalog/lazada-category-picker';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { ShopeeCategoryPicker, type ShopeeCategoryOption } from '@/components/catalog/shopee-category-picker';
import { TikTokCategoryPicker, type TikTokCategoryOption } from '@/components/catalog/tiktok-category-picker';
import { WooCommerceCategoryPicker, type WooCommerceCategoryOption } from '@/components/catalog/woocommerce-category-picker';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx, fioriTabsSx } from '@/lib/fiori-style';

interface GroupData {
    id: number;
    code: string;
    description: string | null;
    is_active: boolean;
    is_ai_translate: boolean;
    subcategory_id: number | null;
    category_id: number | null;
    lazada_category_id: number | null;
    lazada_category: LazadaCategoryOption | null;
    shopee_category_id: number | null;
    shopee_category: ShopeeCategoryOption | null;
    tiktok_category_id: number | null;
    tiktok_category: TikTokCategoryOption | null;
    woocommerce_category_id: number | null;
    woocommerce_category: WooCommerceCategoryOption | null;
}

interface Props {
    group: GroupData;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categories: { id: number; name: string }[];
    subcategories: { id: number; name: string; parent_id: number }[];
    canViewHistory?: boolean;
}

export default function ProductGroupEdit({ group, thumbnailUrl, translations, categories = [], subcategories = [], canViewHistory = false }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const [lazadaCategory, setLazadaCategory] = useState<LazadaCategoryOption | null>(group.lazada_category);
    const [shopeeCategory, setShopeeCategory] = useState<ShopeeCategoryOption | null>(group.shopee_category);
    const [tiktokCategory, setTiktokCategory] = useState<TikTokCategoryOption | null>(group.tiktok_category);
    const [woocommerceCategory, setWoocommerceCategory] = useState<WooCommerceCategoryOption | null>(group.woocommerce_category);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
        { title: t('editProductGroup'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(group.is_ai_translate),
        code: group.code || '',
        description: group.description || '',
        category_id: (group.category_id ?? '') as number | '',
        subcategory_id: (group.subcategory_id ?? '') as number | '',
        lazada_category_id: group.lazada_category_id,
        shopee_category_id: group.shopee_category_id,
        tiktok_category_id: group.tiktok_category_id,
        woocommerce_category_id: group.woocommerce_category_id,
        thumbnail: null as File | null,
        is_active: Boolean(group.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const subcategoryOptions = useMemo(
        () => (data.category_id === '' ? [] : subcategories.filter((s) => s.parent_id === data.category_id)),
        [subcategories, data.category_id],
    );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/product-groups/${group.id}`, {
            onSuccess: () => router.visit('/catalog/product-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editProductGroup')}: ${group.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                {canViewHistory && (
                    <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ ...fioriTabsSx, mb: 3 }}>
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/product-groups/${group.id}/history`} />}

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
                                {t('editProductGroup')}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    component={Link}
                                    href="/catalog/product-groups"
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
                                title={t('productGroupName')}
                                description={t('nameHelperText')}
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />

                            <FioriFormGroup title={t('generalTitle')}>
                                <FioriField label={t('code')} htmlFor="pg-code" hint={t('codeLockedHelperText')}>
                                    <TextField id="pg-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
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
                                            <MenuItem value="">
                                                {data.category_id === '' ? t('selectCategoryFirst') : t('selectSubcategory')}
                                            </MenuItem>
                                            {subcategoryOptions.map((s) => (
                                                <MenuItem key={s.id} value={String(s.id)}>
                                                    {s.name}
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

                            <FioriFormGroup title={t('marketplaceCategoryTitle')} description={t('marketplaceCategoryHelperText')}>
                                <FioriField
                                    label={t('lazadaCategoryLabel')}
                                    valueState={valueStateOf(errors.lazada_category_id)}
                                    message={errors.lazada_category_id}
                                >
                                    <LazadaCategoryPicker
                                        value={lazadaCategory}
                                        onChange={(next) => {
                                            setLazadaCategory(next);
                                            setData('lazada_category_id', next?.id ?? null);
                                        }}
                                        placeholder={t('lazadaCategoryPlaceholder')}
                                        sx={fioriFieldStateSx('none')}
                                    />
                                </FioriField>

                                <FioriField
                                    label={t('shopeeCategoryLabel')}
                                    valueState={valueStateOf(errors.shopee_category_id)}
                                    message={errors.shopee_category_id}
                                >
                                    <ShopeeCategoryPicker
                                        value={shopeeCategory}
                                        onChange={(next) => {
                                            setShopeeCategory(next);
                                            setData('shopee_category_id', next?.id ?? null);
                                        }}
                                        placeholder={t('shopeeCategoryPlaceholder')}
                                        sx={fioriFieldStateSx('none')}
                                    />
                                </FioriField>

                                <FioriField
                                    label={t('tiktokCategoryLabel')}
                                    valueState={valueStateOf(errors.tiktok_category_id)}
                                    message={errors.tiktok_category_id}
                                >
                                    <TikTokCategoryPicker
                                        value={tiktokCategory}
                                        onChange={(next) => {
                                            setTiktokCategory(next);
                                            setData('tiktok_category_id', next?.id ?? null);
                                        }}
                                        placeholder={t('tiktokCategoryPlaceholder')}
                                        sx={fioriFieldStateSx('none')}
                                    />
                                </FioriField>

                                <FioriField
                                    label={t('woocommerceCategoryLabel')}
                                    valueState={valueStateOf(errors.woocommerce_category_id)}
                                    message={errors.woocommerce_category_id}
                                >
                                    <WooCommerceCategoryPicker
                                        value={woocommerceCategory}
                                        onChange={(next) => {
                                            setWoocommerceCategory(next);
                                            setData('woocommerce_category_id', next?.id ?? null);
                                        }}
                                        placeholder={t('woocommerceCategoryPlaceholder')}
                                        sx={fioriFieldStateSx('none')}
                                    />
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
