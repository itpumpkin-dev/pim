import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { Input } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterFormPage } from '../master-crud';

import { FioriField, FioriFormGroup } from '@/components/fiori-form';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

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
            <MasterFormPage title={t('editBom')} backHref="/catalog/bom" processing={processing} onSubmit={submit} errors={errors}>
                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('bomProductField')} fullWidth>
                        <Input disabled value={`${bom.product.sku} — ${bom.product.name}`} />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormGroup title={t('bomComponentsTitle')} description={t('bomComponentsHelperText')}>
                    <ProductPicker
                        value={components}
                        onChange={(next) => {
                            setComponents(next);
                            setData(
                                'component_ids',
                                next.map((p) => p.id),
                            );
                        }}
                        extraParams={{ raw_material_only: '1' }}
                        placeholder={t('rawMaterialSearchPlaceholder')}
                    />
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
