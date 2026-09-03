import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import { FioriField, FioriFormErrorSummary, FioriFormGroup } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface BomData {
    id: number;
    product: ProductOption;
    components: ProductOption[];
}

interface Props {
    bom: BomData;
}

/**
 * แก้ไข BOM — ตัวสินค้า "หัว" (finished good) แก้ไม่ได้แล้วหลังสร้าง (โชว์
 * แบบ read-only เฉยๆ ถ้าอยากเปลี่ยนต้องลบ BOM นี้แล้วสร้างใหม่) แก้ได้แค่รายการ
 * วัตถุดิบ (RM) — ใช้ ProductPicker ตัวเดียวกับที่หน้าแก้ไขสินค้าใช้กับ
 * Related/Up-sell/Cross-sell แต่ผูก `extraParams={{ raw_material_only: '1' }}`
 * ให้ค้นหาได้เฉพาะสินค้าที่ถูกจัดเป็นวัตถุดิบไว้แล้วเท่านั้น (ดู
 * /catalog/raw-materials) เลือกได้มากกว่า 1 ตามที่ระบุไว้ — save ทีเดียว
 * แทนที่รายการทั้งชุด (ดู BomController::update())
 */
export default function BomEdit({ bom }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('bom'), href: '/catalog/bom' },
        { title: bom.product.sku, href: '#' },
    ];

    const [components, setComponents] = useState<ProductOption[]>(bom.components);
    const { data, setData, put, processing, errors, isDirty } = useForm({
        component_ids: bom.components.map((c) => c.id) as number[],
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/bom/${bom.id}`, {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editBom')}: ${bom.product.sku}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 640, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editBom')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/bom" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('bomProductField')} fullWidth>
                        <TextField fullWidth size="small" disabled value={`${bom.product.sku} — ${bom.product.name}`} />
                    </FioriField>
                </FioriFormGroup>

                <Stack sx={{ mt: 2 }}>
                    <FioriFormGroup title={t('bomComponentsTitle')} description={t('bomComponentsHelperText')}>
                        <ProductPicker
                            value={components}
                            onChange={(next) => {
                                setComponents(next);
                                setData('component_ids', next.map((p) => p.id));
                            }}
                            extraParams={{ raw_material_only: '1' }}
                            placeholder={t('rawMaterialSearchPlaceholder')}
                        />
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 640 }} />
            </Box>
        </AppLayout>
    );
}
