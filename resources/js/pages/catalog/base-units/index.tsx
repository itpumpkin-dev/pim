import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CountTag, MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface BaseUnitItem {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    products_count: number;
    is_active: boolean;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    baseUnits: PaginatedData<BaseUnitItem>;
    attributeId: number;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function BaseUnitIndex({ baseUnits, attributeId, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    // เหมือน Brands — แถวพวกนี้คือ AttributeOption ของ attribute `pbaseunit` แต่แยกเป็น
    // permission resource ของตัวเอง (`base_units`) การเพิ่ม/แก้ไข/ลบ ทั้งหมดผ่าน route ที่
    // เช็ค base_units.edit_base_units อยู่แล้ว เช็คตัวเดียวก็ครอบคลุมการเขียนทั้งหน้า
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('base_units.edit_base_units');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('baseUnits'), href: '/catalog/base-units' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/base-units', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = baseUnits.current_page ?? 1;
    const lastPage = baseUnits.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/base-units', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/base-units', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const goToProducts = (row: BaseUnitItem) => {
        const url = `/catalog/products?attribute_filters[0][attribute_id]=${attributeId}&attribute_filters[0][value]=${encodeURIComponent(row.code)}`;
        router.visit(url);
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<BaseUnitItem>[] = [
        {
            key: 'name',
            header: sortHeader('admin_label', t('name')),
            popinText: t('name'),
            priority: 'always',
            render: (row) => <StrongText>{row.admin_label || row.code}</StrongText>,
        },
        {
            key: 'slug',
            header: sortHeader('slug', t('baseUnitAbbrev')),
            popinText: t('baseUnitAbbrev'),
            priority: 'high',
            render: (row) => <SecondaryText value={row.slug} />,
        },
        {
            key: 'description',
            header: sortHeader('description', t('description')),
            popinText: t('description'),
            priority: 'medium',
            render: (row) => <SecondaryText value={row.description} maxWidth={320} />,
        },
        {
            key: 'products_count',
            header: sortHeader('products_count', t('productsCount')),
            popinText: t('productsCount'),
            priority: 'high',
            align: 'right',
            render: (row) => <CountTag count={row.products_count} tooltip={t('viewBaseUnitProducts')} onClick={() => goToProducts(row)} />,
        },
        {
            key: 'is_active',
            header: sortHeader('is_active', t('status')),
            popinText: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: BaseUnitItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/base-units/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('baseUnitsTitle')} />
            <MasterListPage
                title={t('baseUnitsTitle')}
                intro={t('baseUnitsIntro')}
                addLabel={t('addNewBaseUnit')}
                onAdd={canEdit ? () => router.visit('/catalog/base-units/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: baseUnits.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchBaseUnits')}
                />

                <FioriResponsiveTable columns={columns} rows={baseUnits.data} getRowKey={(row) => row.id} emptyMessage={t('noBaseUnitsFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/base-units/${deleteId}`, {
                            preserveScroll: true,
                            onSuccess: () => setDeleteId(null),
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
                {t('confirmDeleteBaseUnit')}
                {(() => {
                    const target = baseUnits.data.find((b) => b.id === deleteId);
                    const count = target?.products_count ?? 0;
                    if (count === 0) return null;
                    return (
                        <FioriMessageStrip severity="warning" style={{ marginTop: '0.75rem' }}>
                            {t('deleteBaseUnitProductWarning', { count })}
                        </FioriMessageStrip>
                    );
                })()}
            </FioriMessageBox>
        </AppLayout>
    );
}
