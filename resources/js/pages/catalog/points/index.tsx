import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, SecondaryText, SortableHeader, StrongText } from '../master-crud';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriStatus } from '@/lib/fiori-style';
import { formatDateRange } from '@/lib/format';

interface PointItem {
    id: number;
    point_type: string;
    point_ratio: string | number;
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
    points: PaginatedData<PointItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PointIndex({ points, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('points.edit_points');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('points'), href: '/catalog/points' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? 'point_type');
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
            router.get('/catalog/points', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = points.current_page ?? 1;
    const lastPage = points.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/points', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/points', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<PointItem>[] = [
        {
            key: 'point_type',
            header: sortHeader('point_type', t('pointType')),
            popinText: t('pointType'),
            priority: 'always',
            render: (row) => <StrongText>{row.point_type}</StrongText>,
        },
        {
            key: 'point_ratio',
            header: sortHeader('point_ratio', t('pointRatio')),
            popinText: t('pointRatio'),
            priority: 'always',
            align: 'right',
            render: (row) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(row.point_ratio)}</span>,
        },
        {
            key: 'period',
            header: t('pointPeriod'),
            priority: 'medium',
            render: (row) => {
                const period = formatDateRange(row.start_date, row.end_date);
                return period ? period : <SecondaryText value={null} />;
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
                      render: (row: PointItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/points/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('points')} />
            <MasterListPage
                title={tNav('points')}
                addLabel={t('createPoint')}
                onAdd={canEdit ? () => router.visit('/catalog/points/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: points.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchPoints')}
                />

                <FioriResponsiveTable columns={columns} rows={points.data} getRowKey={(row) => row.id} emptyMessage={t('noPointsFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/points/${deleteId}`, {
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
                {t('confirmDeletePoint')}
            </FioriMessageBox>
        </AppLayout>
    );
}
