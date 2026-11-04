import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    MasterListPage,
    MasterListToolbar,
    MasterPagination,
    RowActions,
    SecondaryText,
    SortableHeader,
    StrongText,
    masterStyles,
} from '../master-crud';

interface CurrencyItem {
    id: number;
    code: string;
    name: string;
    exchange_rate: string;
    channels_count: number;
    vendors_count: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    currencies: PaginatedData<CurrencyItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function CurrencyIndex({ currencies, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('currencies.edit_currencies');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('currencies'), href: '/catalog/currencies' },
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
            router.get('/catalog/currencies', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = currencies.current_page ?? 1;
    const lastPage = currencies.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/currencies', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/currencies', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <SortableHeader label={label} active={sortField === field} direction={sortDir} onSort={() => handleSort(field)} />
    );

    const columns: FioriResponsiveColumn<CurrencyItem>[] = [
        {
            key: 'code',
            header: sortHeader('code', t('currencyCode')),
            popinText: t('currencyCode'),
            priority: 'always',
            render: (row) => <StrongText>{row.code}</StrongText>,
        },
        {
            key: 'name',
            header: sortHeader('name', t('currencyName')),
            popinText: t('currencyName'),
            priority: 'always',
            render: (row) => <SecondaryText value={row.name} />,
        },
        {
            key: 'exchange_rate',
            header: sortHeader('exchange_rate', t('currencyExchangeRate')),
            popinText: t('currencyExchangeRate'),
            priority: 'medium',
            align: 'right',
            render: (row) => <SecondaryText value={row.exchange_rate} />,
        },
        {
            key: 'channels_count',
            header: tNav('channels'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.channels_count ? <span>{row.channels_count}</span> : <span className={masterStyles.dash}>0</span>),
        },
        {
            key: 'vendors_count',
            header: tNav('vendors'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.vendors_count ? <span>{row.vendors_count}</span> : <span className={masterStyles.dash}>0</span>),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CurrencyItem) => (
                          <RowActions onEdit={() => router.visit(`/catalog/currencies/${row.id}/edit`)} onDelete={() => setDeleteId(row.id)} />
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('currencies')} />
            <MasterListPage
                title={tNav('currencies')}
                addLabel={t('createCurrency')}
                onAdd={canEdit ? () => router.visit('/catalog/currencies/create') : undefined}
            >
                <MasterListToolbar
                    resultsLabel={tGrid('results', { count: currencies.total })}
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder={t('searchCurrencies')}
                />

                <FioriResponsiveTable columns={columns} rows={currencies.data} getRowKey={(row) => row.id} emptyMessage={t('noCurrenciesFound')} />

                <MasterPagination currentPage={currentPage} lastPage={lastPage} label={tGrid('pageOf', { lastPage })} onPageChange={goToPage} />
            </MasterListPage>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/currencies/${deleteId}`, {
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
                {t('confirmDeleteCurrency')}
                {(() => {
                    const target = currencies.data.find((c) => c.id === deleteId);
                    const inUse = (target?.channels_count ?? 0) + (target?.vendors_count ?? 0);
                    if (!inUse) return null;
                    return (
                        <FioriMessageStrip severity="warning" style={{ marginTop: '0.75rem' }}>
                            {t('currencyInUseWarning', { channels: target?.channels_count ?? 0, vendors: target?.vendors_count ?? 0 })}
                        </FioriMessageStrip>
                    );
                })()}
            </FioriMessageBox>
        </AppLayout>
    );
}
