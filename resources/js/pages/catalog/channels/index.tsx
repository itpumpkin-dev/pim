import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/filter.js';
import { Button } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, MasterListToolbar, MasterPagination, RowActions, StrongText } from '../master-crud';

interface ChannelItem {
    id: number;
    code: string;
    name: string | null;
    root_category_id: number | null;
    rootCategory?: { id: number; name: string } | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    channels: PaginatedData<ChannelItem>;
    filters: { search?: string; filters?: Record<string, FilterValue> };
    filterColumns: Record<string, GridColumn>;
}

export default function ChannelIndex({ channels, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('channels.create_channels');
    const canEdit = permissions.includes('channels.edit_channels');
    const canDelete = permissions.includes('channels.delete_channels');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteChannelId, setDeleteChannelId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/channels', { search, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (page: number) => {
        router.get('/catalog/channels', { search, page, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/channels', { search, filters: next }, { preserveState: true });
    };

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // ชื่อช่องทาง (name) กับปุ่ม action ของแถวจะยังโชว์อยู่แม้จอมือถือแคบๆ
    // รองลงมาคือ code แล้วก็ root category ที่ลิงก์ไว้
    // ส่วน id จะถูกซ่อนก่อนเพื่อนเพราะมีประโยชน์น้อยสุดตอนดูเร็วๆ
    const columns: FioriResponsiveColumn<ChannelItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'high',
            render: (row) => row.code,
        },
        {
            key: 'name',
            header: t('name'),
            priority: 'always',
            render: (row) => <StrongText>{row.name || '-'}</StrongText>,
        },
        {
            key: 'rootCategory',
            header: t('rootCategoryOptional'),
            priority: 'medium',
            render: (row) =>
                row.rootCategory ? (
                    <span style={{ color: 'var(--sapLinkColor)', fontWeight: 500 }}>{row.rootCategory.name}</span>
                ) : (
                    <span style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>{t('noRootCategory')}</span>
                ),
        },
        ...(canEdit || canDelete
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: ChannelItem) => (
                          <RowActions
                              onEdit={canEdit ? () => router.visit(`/catalog/channels/${row.id}/edit`) : undefined}
                              onDelete={canDelete ? () => setDeleteChannelId(row.id) : undefined}
                          />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('channels')} />
            <MasterListPage
                before={<SalesChannelSectionTabs active="channels" />}
                title={tNav('channels')}
                addLabel={t('createChannel')}
                onAdd={canCreate ? () => router.visit('/catalog/channels/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: channels.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchChannels')}
                    end={
                        <Button icon="filter" onClick={() => setFilterDrawerOpen(true)}>
                            {tGrid('filter')}
                            {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                        </Button>
                    }
                />

                <FioriResponsiveTable columns={columns} rows={channels.data} getRowKey={(row) => row.id} emptyMessage={t('noChannelsFound')} />

                {channels.last_page > 1 && (
                    <MasterPagination
                        currentPage={channels.current_page}
                        lastPage={channels.last_page}
                        label={tGrid('pageOf', { lastPage: channels.last_page })}
                        onPageChange={handlePageChange}
                    />
                )}
            </MasterListPage>

            <FioriMessageBox
                open={deleteChannelId !== null}
                onCancel={() => setDeleteChannelId(null)}
                onConfirm={() => {
                    if (deleteChannelId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/channels/${deleteChannelId}`, {
                            onSuccess: () => setDeleteChannelId(null),
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
                {t('confirmDeleteChannel')}
            </FioriMessageBox>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={filterColumns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}
