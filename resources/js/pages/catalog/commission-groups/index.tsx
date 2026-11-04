import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { FioriStatus } from '@/lib/fiori-style';
import { formatDateRange } from '@/lib/format';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

interface CommissionGroupItem {
    id: number;
    code: string;
    p_group_name: string | null;
    divisor_start: string | number;
    divisor_secondary: string | number;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    remark: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    commissionGroups: PaginatedData<CommissionGroupItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CommissionGroupIndex({ commissionGroups, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('commission_groups.edit_commission_groups');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('commissionGroups'), href: '/catalog/commission-groups' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? 'code');
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
            router.get('/catalog/commission-groups', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = commissionGroups.current_page ?? 1;
    const lastPage = commissionGroups.last_page ?? 1;
    const goToPage = (page: number) =>
        router.get('/catalog/commission-groups', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/commission-groups', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<CommissionGroupItem>[] = [
        {
            key: 'code',
            header: sortHeader('code', t('commissionGroupCode')),
            popinText: t('commissionGroupCode'),
            priority: 'always',
            render: (row) => <StrongText>{row.code}</StrongText>,
        },
        {
            key: 'p_group_name',
            header: sortHeader('p_group_name', t('commissionGroupName')),
            popinText: t('commissionGroupName'),
            priority: 'high',
            render: (row) => <SecondaryText value={row.p_group_name} />,
        },
        {
            key: 'divisor_start',
            header: sortHeader('divisor_start', t('divisorStart')),
            popinText: t('divisorStart'),
            priority: 'high',
            align: 'right',
            render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(row.divisor_start)}</span>,
        },
        {
            key: 'divisor_secondary',
            header: sortHeader('divisor_secondary', t('divisorSecondary')),
            popinText: t('divisorSecondary'),
            priority: 'high',
            align: 'right',
            render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(row.divisor_secondary)}</span>,
        },
        {
            key: 'period',
            header: t('pointPeriod'),
            priority: 'medium',
            render: (row) => {
                const period = formatDateRange(row.start_date, row.end_date);
                return period ? <span>{period}</span> : <SecondaryText value={null} />;
            },
        },
        {
            key: 'is_active',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'remark',
            header: t('remark'),
            priority: 'medium',
            render: (row) => <SecondaryText value={row.remark} maxWidth={320} />,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CommissionGroupItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/commission-groups/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('commissionGroups')} />
            <MasterListPage
                title={tNav('commissionGroups')}
                addLabel={t('createCommissionGroup')}
                onAdd={canEdit ? () => router.visit('/catalog/commission-groups/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: commissionGroups.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchCommissionGroups')}
                />

                <FioriResponsiveTable
                    columns={columns}
                    rows={commissionGroups.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noCommissionGroupsFound')}
                />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/commission-groups/${deleteId}`, {
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
                {t('confirmDeleteCommissionGroup')}
            </FioriMessageBox>
        </AppLayout>
    );
}
