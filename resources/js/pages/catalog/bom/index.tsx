import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, masterStyles, RowActions, StrongText } from '../master-crud';

import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';

interface BomItem {
    id: number;
    product_id: number;
    sku: string;
    name: string;
    components_count: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    boms: PaginatedData<BomItem>;
    filters: { search?: string };
}

export default function BomIndex({ boms, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('bom.edit_bom');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('bom'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/bom', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = boms.current_page ?? 1;
    const lastPage = boms.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/bom', { search, page }, { preserveState: true });

    const columns: FioriResponsiveColumn<BomItem>[] = [
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
        {
            key: 'components_count',
            header: t('bomComponentsCount'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.components_count ? row.components_count : <span className={masterStyles.dash}>0</span>),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: BomItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/bom/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('bom')} />
            <MasterListPage title={tNav('bom')} addLabel={t('createBom')} onAdd={canEdit ? () => router.visit('/catalog/bom/create') : undefined}>
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: boms.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('rawMaterialSearchPlaceholder')}
                />

                <FioriResponsiveTable columns={columns} rows={boms.data} getRowKey={(row) => row.id} emptyMessage={t('noBomFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/bom/${deleteId}`, {
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
                {t('confirmDeleteBom')}
            </FioriMessageBox>
        </AppLayout>
    );
}
