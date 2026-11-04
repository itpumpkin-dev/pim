import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { ComboBox, ComboBoxItem } from '@ui5/webcomponents-react';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterFormPage } from '../master-crud';

import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { type ProductOption } from '@/components/product-picker';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

/**
 * "สร้าง BOM ใหม่" — เลือก SKU สินค้าที่มีอยู่แล้วในระบบตัวเดียว (ไม่ได้สร้าง
 * สินค้าใหม่) เพื่อเป็น "หัว"/finished good ของ BOM ชุดนี้ — เลือกได้ทีละตัวเท่านั้น
 * (ต่างจาก ProductPicker ที่ใช้กับรายการวัตถุดิบด้านล่างซึ่งเลือกได้หลายตัว)
 * เลยไม่ใช้ ProductPicker ตรงนี้ (เขียน ComboBox ค้นหาแบบ single-select
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
            <MasterFormPage
                title={t('createBom')}
                backHref="/catalog/bom"
                processing={processing}
                saveDisabled={!data.product_id}
                onSubmit={submit}
                errors={errors}
            >
                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('bomProductField')}
                        htmlFor="bom-product"
                        valueState={valueStateOf(errors.product_id)}
                        message={errors.product_id}
                        hint={t('bomProductFieldHelperText')}
                        fullWidth
                    >
                        <ComboBox
                            id="bom-product"
                            style={{ width: '100%' }}
                            filter="None"
                            loading={loading}
                            placeholder={t('rawMaterialSearchPlaceholder')}
                            value={query}
                            selectedValue={selected ? String(selected.id) : undefined}
                            valueState={ui5ValueState(valueStateOf(errors.product_id))}
                            onInput={(e) => setQuery(e.target.value)}
                            onSelectionChange={(e) => {
                                const id = e.detail.item?.value;
                                const val = (id ? [...results, ...(selected ? [selected] : [])].find((opt) => String(opt.id) === id) : null) ?? null;
                                setSelected(val);
                                setData('product_id', val?.id ?? null);
                            }}
                        >
                            {(selected && !results.some((opt) => opt.id === selected.id) ? [selected, ...results] : results).map((opt) => (
                                <ComboBoxItem key={opt.id} value={String(opt.id)} text={`${opt.sku} — ${opt.name}`} />
                            ))}
                        </ComboBox>
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
