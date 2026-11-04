import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface BusinessTypeItem {
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
    businessTypes: PaginatedData<BusinessTypeItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function BusinessTypeIndex({ businessTypes, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('business_types.edit_business_types');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('businessTypes'), href: '/catalog/business-types' },
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
            router.get('/catalog/business-types', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = businessTypes.current_page ?? 1;
    const lastPage = businessTypes.last_page ?? 1;
    const goToPage = (page: number) =>
        router.get('/catalog/business-types', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/business-types', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<BusinessTypeItem>[] = [
        {
            key: 'name',
            header: sortHeader('name', t('businessTypeName')),
            popinText: t('businessTypeName'),
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
                      render: (row: BusinessTypeItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/business-types/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('businessTypes')} />
            <MasterListPage
                title={tNav('businessTypes')}
                addLabel={t('createBusinessType')}
                onAdd={canEdit ? () => router.visit('/catalog/business-types/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: businessTypes.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchBusinessTypes')}
                />

                <FioriResponsiveTable
                    columns={columns}
                    rows={businessTypes.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noBusinessTypesFound')}
                />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/business-types/${deleteId}`, {
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
                {t('confirmDeleteBusinessType')}
            </FioriMessageBox>
        </AppLayout>
    );
}
