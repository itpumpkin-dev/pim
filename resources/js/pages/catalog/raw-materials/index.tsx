import { FioriFormGroup } from '@/components/fiori-form';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Button } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, masterStyles, RowActions, StrongText } from '../master-crud';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ProductPicker, type ProductOption } from '@/components/product-picker';

interface RawMaterialItem {
    id: number;
    sku: string;
    name: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    products: PaginatedData<RawMaterialItem>;
    filters: { search?: string };
}

/**
 * "วัตถุดิบ" (Raw Material / RM) master — ไม่ใช่หน้าจอสร้างสินค้าใหม่ แค่หน้า
 * สำหรับติ๊กว่าสินค้าที่มีอยู่แล้วในระบบตัวไหนใช้เป็นวัตถุดิบได้บ้าง
 * (products.is_raw_material — ดู RawMaterialController) รายการที่เลือกไว้ที่นี่
 * จะเป็นตัวเลือกส่วนประกอบของ BOM (ดู catalog/bom/edit.tsx)
 */
export default function RawMaterialIndex({ products, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('raw_materials.edit_raw_materials');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('rawMaterials'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [removeId, setRemoveId] = useState<number | null>(null);
    const [removing, setRemoving] = useState(false);
    const [picked, setPicked] = useState<ProductOption[]>([]);
    const [adding, setAdding] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/raw-materials', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/raw-materials', { search, page }, { preserveState: true });

    const addPicked = () => {
        if (picked.length === 0) return;
        setAdding(true);
        router.post(
            '/catalog/raw-materials',
            { product_ids: picked.map((p) => p.id) },
            {
                preserveScroll: true,
                onSuccess: () => setPicked([]),
                onFinish: () => setAdding(false),
            },
        );
    };

    const columns: FioriResponsiveColumn<RawMaterialItem>[] = [
        {
            key: 'sku',
            header: 'SKU',
            priority: 'always',
            render: (row) => <StrongText>{row.sku}</StrongText>,
        },
        {
            key: 'name',
            header: t('rawMaterialNameColumn'),
            priority: 'always',
            render: (row) => <span className={masterStyles.secondary}>{row.name}</span>,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: RawMaterialItem) => <RowActions onDelete={() => setRemoveId(row.id)} />,
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('rawMaterials')} />
            <MasterListPage title={tNav('rawMaterials')}>
                {canEdit && (
                    <FioriFormGroup title={t('rawMaterialAddTitle')} description={t('rawMaterialAddHelperText')} style={{ marginBottom: '1.5rem' }}>
                        <ProductPicker value={picked} onChange={setPicked} />
                        <div>
                            <Button
                                design="Emphasized"
                                disabled={picked.length === 0 || adding}
                                loading={adding}
                                loadingDelay={0}
                                onClick={addPicked}
                            >
                                {adding ? t('saving') : t('rawMaterialAddButton')}
                            </Button>
                        </div>
                    </FioriFormGroup>
                )}

                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: products.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('rawMaterialSearchPlaceholder')}
                />

                <FioriResponsiveTable columns={columns} rows={products.data} getRowKey={(row) => row.id} emptyMessage={t('noRawMaterialsFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={removeId !== null}
                onCancel={() => setRemoveId(null)}
                onConfirm={() => {
                    if (removeId !== null) {
                        setRemoving(true);
                        router.delete(`/catalog/raw-materials/${removeId}`, {
                            preserveScroll: true,
                            onSuccess: () => setRemoveId(null),
                            onFinish: () => setRemoving(false),
                        });
                    }
                }}
                title={tGrid('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={tGrid('delete')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={removing}
            >
                {t('confirmRemoveRawMaterial')}
            </FioriMessageBox>
        </AppLayout>
    );
}
