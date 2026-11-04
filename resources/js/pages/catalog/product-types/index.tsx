import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface ProductTypeItem {
    id: number;
    name: string;
    description: string | null;
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
    productTypes: PaginatedData<ProductTypeItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function ProductTypeIndex({ productTypes, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('product_types.edit_product_types');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productTypes'), href: '/catalog/product-types' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? 'name');
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
            router.get('/catalog/product-types', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = productTypes.current_page ?? 1;
    const lastPage = productTypes.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/product-types', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/product-types', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<ProductTypeItem>[] = [
        {
            key: 'name',
            header: sortHeader('name', t('productTypeName')),
            popinText: t('productTypeName'),
            priority: 'always',
            render: (row) => <StrongText>{row.name}</StrongText>,
        },
        {
            key: 'description',
            header: t('description'),
            priority: 'medium',
            render: (row) => <SecondaryText value={row.description} maxWidth={420} />,
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
                      render: (row: ProductTypeItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/product-types/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('productTypes')} />
            <MasterListPage
                title={tNav('productTypes')}
                addLabel={t('createProductType')}
                onAdd={canEdit ? () => router.visit('/catalog/product-types/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: productTypes.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchProductTypes')}
                />

                <FioriResponsiveTable
                    columns={columns}
                    rows={productTypes.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noProductTypesFound')}
                />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/product-types/${deleteId}`, {
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
                {t('confirmDeleteProductType')}
            </FioriMessageBox>
        </AppLayout>
    );
}
