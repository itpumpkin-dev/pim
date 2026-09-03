import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type ProductOption } from '@/components/product-picker';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

/**
 * "สร้าง BOM ใหม่" — เลือก SKU สินค้าที่มีอยู่แล้วในระบบตัวเดียว (ไม่ได้สร้าง
 * สินค้าใหม่) เพื่อเป็น "หัว"/finished good ของ BOM ชุดนี้ — เลือกได้ทีละตัวเท่านั้น
 * (ต่างจาก ProductPicker ที่ใช้กับรายการวัตถุดิบด้านล่างซึ่งเลือกได้หลายตัว)
 * เลยไม่ใช้ ProductPicker ตรงนี้ (เขียน Autocomplete ค้นหาแบบ single-select
 * แยกเบาๆ เอง) พอสร้างเสร็จจะพาไปหน้าแก้ไขทันทีเพื่อเพิ่มรายการวัตถุดิบต่อ
 */
export default function BomCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('bom'), href: '/catalog/bom' },
        { title: t('createBom'), href: '/catalog/bom/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        product_id: null as number | null,
    });
    const [selected, setSelected] = useState<ProductOption | null>(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductOption[]>([]);
    const [loading, setLoading] = useState(false);
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            fetch(`/catalog/products/search?${new URLSearchParams({ q: query })}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : []))
                .then((rows: ProductOption[]) => setResults(rows))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/bom', {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createBom')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 560, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createBom')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/bom" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing || !data.product_id}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            sx={fioriEmphasizedSx}
                        >
                            {processing ? t('saving') : t('bomCreateButton')}
                        </Button>
                    </Stack>
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('bomProductField')}
                        htmlFor="bom-product"
                        valueState={valueStateOf(errors.product_id)}
                        message={errors.product_id}
                        hint={t('bomProductFieldHelperText')}
                        fullWidth
                    >
                        <Autocomplete
                            id="bom-product"
                            size="small"
                            options={results}
                            loading={loading}
                            filterOptions={(options) => options}
                            getOptionLabel={(opt) => `${opt.sku} — ${opt.name}`}
                            inputValue={query}
                            onInputChange={(_, val) => setQuery(val)}
                            value={selected}
                            onChange={(_, val) => {
                                setSelected(val);
                                setData('product_id', val?.id ?? null);
                            }}
                            renderInput={(params) => (
                                <TextField {...params} placeholder={t('rawMaterialSearchPlaceholder')} sx={fioriFieldStateSx(valueStateOf(errors.product_id))} />
                            )}
                        />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 560 }} />
            </Box>
        </AppLayout>
    );
}
