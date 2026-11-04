import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { FioriStatus } from '@/lib/fiori-style';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface VendorItem {
    id: number;
    code: string;
    name: string;
    name_en: string | null;
    vendor_group: 'domestic' | 'foreign' | null;
    default_price_term: string | null;
    currency_code?: string | null;
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
    vendors: PaginatedData<VendorItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function VendorIndex({ vendors, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('vendors.edit_vendors');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('vendors'), href: '/catalog/vendors' },
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
            router.get('/catalog/vendors', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = vendors.current_page ?? 1;
    const lastPage = vendors.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/vendors', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/vendors', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const vendorGroupLabel = (group: VendorItem['vendor_group']) =>
        group === 'domestic' ? t('vendorGroupDomestic') : group === 'foreign' ? t('vendorGroupForeign') : null;

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<VendorItem>[] = [
        {
            key: 'code',
            header: sortHeader('code', t('vendorCode')),
            popinText: t('vendorCode'),
            priority: 'high',
            render: (row) => <SecondaryText value={row.code} />,
        },
        {
            key: 'name',
            header: sortHeader('name', t('vendorName')),
            popinText: t('vendorName'),
            priority: 'always',
            render: (row) => (
                <div>
                    <StrongText>{row.name}</StrongText>
                    {row.name_en && row.name_en !== row.name && (
                        <span style={{ display: 'block', color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' }}>
                            {row.name_en}
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'vendor_group',
            header: sortHeader('vendor_group', t('vendorGroup')),
            popinText: t('vendorGroup'),
            priority: 'medium',
            render: (row) => {
                const label = vendorGroupLabel(row.vendor_group);
                return label ? <span>{label}</span> : <SecondaryText value={null} />;
            },
        },
        {
            key: 'currency',
            header: t('mainCurrency'),
            priority: 'medium',
            render: (row) => (row.currency_code ? <span>{row.currency_code}</span> : <SecondaryText value={null} />),
        },
        {
            key: 'default_price_term',
            header: t('defaultPriceTerm'),
            priority: 'low',
            render: (row) => (row.default_price_term ? <span>{row.default_price_term}</span> : <SecondaryText value={null} />),
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
                      render: (row: VendorItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/vendors/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('vendors')} />
            <MasterListPage
                title={tNav('vendors')}
                addLabel={t('createVendor')}
                onAdd={canEdit ? () => router.visit('/catalog/vendors/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: vendors.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchVendors')}
                />

                <FioriResponsiveTable columns={columns} rows={vendors.data} getRowKey={(row) => row.id} emptyMessage={t('noVendorsFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/vendors/${deleteId}`, {
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
                {t('confirmDeleteVendor')}
            </FioriMessageBox>
        </AppLayout>
    );
}
