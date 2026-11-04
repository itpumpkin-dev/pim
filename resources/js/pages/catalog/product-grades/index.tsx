import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    MasterListPage,
    MasterListToolbar,
    MasterPagination,
    masterStyles,
    RowActions,
    SecondaryText,
    SortableHeader,
    StrongText,
} from '../master-crud';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriStatus } from '@/lib/fiori-style';

interface ProductGradeItem {
    id: number;
    code: string;
    name: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
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
    productGrades: PaginatedData<ProductGradeItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

// วันที่จาก backend เป็น 'Y-m-d' (ProductGrade casts 'date:Y-m-d') อยู่แล้ว —
// แค่ต่อกันเป็นช่วงให้อ่านง่าย ไม่ต้อง parse/format เพิ่ม
function formatPeriod(start: string | null, end: string | null): string {
    if (!start && !end) return '—';
    if (start && end) return `${start} – ${end}`;
    return start ? `${start} –` : `– ${end}`;
}

export default function ProductGradeIndex({ productGrades, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('product_grades.edit_product_grades');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGrades'), href: '/catalog/product-grades' },
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
            router.get('/catalog/product-grades', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = productGrades.current_page ?? 1;
    const lastPage = productGrades.last_page ?? 1;
    const goToPage = (page: number) =>
        router.get('/catalog/product-grades', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/product-grades', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<ProductGradeItem>[] = [
        {
            key: 'code',
            header: sortHeader('code', t('productGradeCode')),
            popinText: t('productGradeCode'),
            priority: 'always',
            render: (row) => <StrongText>{row.code}</StrongText>,
        },
        {
            key: 'name',
            header: sortHeader('name', t('productGradeName')),
            popinText: t('productGradeName'),
            priority: 'always',
            render: (row) => <StrongText>{row.name}</StrongText>,
        },
        {
            key: 'description',
            header: t('description'),
            priority: 'medium',
            render: (row) => <SecondaryText value={row.description} maxWidth={360} />,
        },
        {
            key: 'period',
            header: t('gradePeriod'),
            priority: 'medium',
            render: (row) => (
                <span className={masterStyles.secondary} style={{ whiteSpace: 'nowrap' }}>
                    {formatPeriod(row.start_date, row.end_date)}
                </span>
            ),
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
                      render: (row: ProductGradeItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/product-grades/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('productGrades')} />
            <MasterListPage
                title={tNav('productGrades')}
                addLabel={t('createProductGrade')}
                onAdd={canEdit ? () => router.visit('/catalog/product-grades/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: productGrades.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchProductGrades')}
                />

                <FioriResponsiveTable
                    columns={columns}
                    rows={productGrades.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noProductGradesFound')}
                />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/product-grades/${deleteId}`, {
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
                {t('confirmDeleteProductGrade')}
            </FioriMessageBox>
        </AppLayout>
    );
}
