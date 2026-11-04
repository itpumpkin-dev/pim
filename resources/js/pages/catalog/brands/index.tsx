import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/picture.js';
import { Icon } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';

import { CountTag, MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface BrandItem {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    thumbnail_url: string | null;
    parent_id: number | null;
    parent_name: string | null;
    products_count: number;
    mapped_platforms?: string[];
}

interface ParentOption {
    id: number;
    name: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    brands: PaginatedData<BrandItem>;
    parentOptions: ParentOption[];
    attributeId: number;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function BrandIndex({ brands, parentOptions, attributeId, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    // จริงๆ แล้ว Brand คือแถวข้อมูลของ AttributeOption ข้างในนั่นแหละ แต่แยกออกมาเป็น
    // permission resource ของตัวเอง (`brands`) ต่างหากจาก `attributes` เพื่อให้กำหนดสิทธิ์
    // ให้ role ใช้อย่างใดอย่างหนึ่งได้โดยไม่ต้องให้อีกอันด้วย — ดูได้จาก migration
    // split_brands_permission_from_attributes การเพิ่ม/แก้ไข/ลบ ที่นี่ทั้งหมดจะผ่าน
    // route ที่เช็คสิทธิ์ brands.edit_brands ดังนั้นเช็คแค่ตัวเดียวก็ครอบคลุมการเขียนข้อมูล
    // ทั้งหน้าแล้ว (แค่ดูรายการเฉยๆ ใช้แค่สิทธิ์ list_brands ซึ่ง route index กับเมนู sidebar
    // บังคับเช็คให้อยู่แล้ว)
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('brands.edit_brands');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [deleteBrandId, setDeleteBrandId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/brands', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = brands.current_page ?? 1;
    const lastPage = brands.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/brands', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/brands', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const goToProducts = (option: BrandItem) => {
        const url = `/catalog/products?attribute_filters[0][attribute_id]=${attributeId}&attribute_filters[0][value]=${encodeURIComponent(option.code)}`;
        router.visit(url);
    };

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): ชื่อแบรนด์ใช้
    // ระบุแถวและปุ่ม actions ต้องโชว์ตลอดแม้จอมือถือแคบสุด ส่วน chip นับจำนวนสินค้าเป็น
    // ปุ่มที่กดใช้งานได้จริง (กดแล้วไปหน้าสินค้าของแบรนด์นั้น) เลยได้ความสำคัญรองลงมา
    // ตามด้วยแพลตฟอร์มที่ map ไว้กับคำอธิบาย ส่วน slug ที่มีประโยชน์น้อยสุดจะโดนซ่อนก่อน —
    // ส่วน thumbnail ที่เป็นแค่รูปประกอบไม่มีข้อมูลอะไรที่คุ้มจะเอาไปโชว์แบบ label/value เลย
    // ตัดออกจาก pop-in ไปเลย
    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<BrandItem>[] = [
        {
            key: 'thumbnail',
            header: t('imageLabel'),
            priority: 'low',
            hideInPopin: true,
            render: (row) => (
                <ClickableThumbnail
                    src={row.thumbnail_url}
                    alt={row.admin_label || row.code}
                    size={38}
                    radius={1.5}
                    fallback={<Icon name="picture" style={{ color: 'var(--sapContent_IconColor)' }} />}
                />
            ),
        },
        {
            key: 'name',
            header: sortHeader('admin_label', t('name')),
            popinText: t('name'),
            priority: 'always',
            render: (row) => <StrongText>{row.admin_label || row.code}</StrongText>,
        },
        {
            key: 'description',
            header: sortHeader('description', t('description')),
            popinText: t('description'),
            priority: 'medium',
            render: (row) => <SecondaryText value={row.description} maxWidth={250} />,
        },
        {
            key: 'slug',
            header: sortHeader('slug', t('slug')),
            popinText: t('slug'),
            priority: 'low',
            render: (row) => <SecondaryText value={row.slug} />,
        },
        {
            key: 'products_count',
            header: sortHeader('products_count', t('productsCount')),
            popinText: t('productsCount'),
            priority: 'high',
            align: 'right',
            render: (row) => <CountTag count={row.products_count} tooltip={t('viewBrandProducts')} onClick={() => goToProducts(row)} />,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: BrandItem) => (
                          // ปุ่มลบปิดไว้ (เดิม comment out ไว้) — เหลือแค่แก้ไข
                          <RowActions onEdit={() => router.visit(`/catalog/brands/${row.id}/edit`)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={t('brandsTitle')} />
                <MasterListPage
                    title={t('brandsTitle')}
                    intro={t('brandsIntro')}
                    addLabel={t('addNewBrand')}
                    onAdd={canEdit ? () => router.visit('/catalog/brands/create') : undefined}
                >
                    <MasterListToolbar
                        resultsLabel={tGrid('results', { count: brands.total })}
                        search={search}
                        onSearchChange={setSearch}
                        searchPlaceholder={t('searchBrands')}
                    />

                    <FioriResponsiveTable columns={columns} rows={brands.data} getRowKey={(row) => row.id} emptyMessage={t('noBrandsFound')} />

                    <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
                </MasterListPage>

                <FioriMessageBox
                    open={deleteBrandId !== null}
                    onCancel={() => setDeleteBrandId(null)}
                    onConfirm={() => {
                        if (deleteBrandId !== null) {
                            setDeleting(true);
                            router.delete(`/catalog/brands/${deleteBrandId}`, {
                                onSuccess: () => setDeleteBrandId(null),
                                onFinish: () => setDeleting(false),
                            });
                        }
                    }}
                    title={tGrid('confirmDeletion')}
                    severity="warning"
                    destructive
                    confirmLabel={tGrid('delete')}
                    cancelLabel={tGrid('cancel')}
                    confirmLoading={deleting}
                >
                    {t('confirmDeleteBrand')}
                    {(() => {
                        const target = brands.data.find((b) => b.id === deleteBrandId);
                        const count = target?.products_count ?? 0;
                        if (count === 0) return null;
                        return (
                            <div style={{ marginTop: '0.75rem', fontWeight: 600, color: 'var(--sapNegativeTextColor)' }}>
                                {t('deleteBrandProductWarning', { count })}
                            </div>
                        );
                    })()}
                </FioriMessageBox>
            </AppLayout>
        </ImagePreviewProvider>
    );
}
