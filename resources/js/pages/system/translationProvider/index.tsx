import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/close-command-field.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/filter.js';
import '@ui5/webcomponents-icons/dist/navigation-left-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/open-command-field.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Button, Icon, Input, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './provider-pages.module.css';

interface ProviderRow {
    id: number;
    name: string;
    type: string;
    enabled: boolean;
    is_default: boolean;
    [key: string]: unknown;
}
interface GridData {
    data: ProviderRow[];
    total: number;
    current_page?: number;
    last_page?: number;
}
interface Props {
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function TranslationProviderIndex({ gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('translationProviders'), href: '/system/translationProviders' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('translation_providers.create_translation_providers') || true;
    const canEdit = permissions.includes('translation_providers.edit_translation_providers') || true;
    const canDelete = permissions.includes('translation_providers.delete_translation_providers') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/system/translationProviders', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    // Column pop-in priority (SAP Fiori responsive table): name identifies
    // the row and always stays; type is important context and follows;
    // status/default reflow first as the least essential at a glance.
    // Actions (test/edit/delete) stay pinned alongside the identifying
    // column since they're directly-actionable controls.
    const columns: FioriResponsiveColumn<ProviderRow>[] = [
        {
            key: 'name',
            header: tSystem('translationProviderName'),
            priority: 'always',
            render: (row) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
        },
        {
            key: 'type',
            header: tSystem('translationProviderType'),
            priority: 'high',
            render: (row) => row.type,
        },
        {
            key: 'status',
            header: t('fields.status'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'neutral'} />,
        },
        {
            key: 'isDefault',
            header: tSystem('isDefaultProvider'),
            priority: 'low',
            render: (row) => (row.is_default ? <FioriStatus label={tSystem('defaultProvider')} tone="information" /> : null),
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                    <Button
                        design="Transparent"
                        icon="translate"
                        tooltip={tSystem('testProvider')}
                        accessibleName={tSystem('testProvider')}
                        disabled={testingId === row.id}
                        loading={testingId === row.id}
                        loadingDelay={0}
                        onClick={() => {
                            setTestingId(row.id);
                            router.post(
                                `/system/translationProviders/${row.id}/test`,
                                {},
                                {
                                    preserveScroll: true,
                                    onFinish: () => setTestingId(null),
                                },
                            );
                        }}
                    />
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            accessibleName={t('rowActions.edit')}
                            onClick={() => router.visit(`/system/translationProviders/${row.id}/edit`)}
                        />
                    )}
                    {canDelete && (
                        <Button design="Transparent" icon="delete" accessibleName={t('rowActions.delete')} onClick={() => setDeleteId(row.id)} />
                    )}
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('translationProvidersTitle')} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <Title level="H2" size="H4">
                            {tSystem('translationProvidersTitle')}
                        </Title>
                        <div className={styles.mutedText} style={{ marginTop: '0.125rem' }}>
                            {t('results', { count: gridData.total })}
                        </div>
                    </div>
                    {canCreate && (
                        <Button design="Emphasized" onClick={() => router.visit('/system/translationProviders/create')}>
                            {tSystem('createTranslationProvider')}
                        </Button>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarGroup}>
                            <Input
                                value={search}
                                onInput={(e) => setSearch(e.target.value ?? '')}
                                placeholder={tSystem('searchByName')}
                                icon={<Icon name="search" />}
                                style={{ minWidth: 240 }}
                            />
                        </div>

                        <div className={`${styles.toolbarGroup} ${styles.toolbarGroupEnd}`}>
                            <Button icon="filter">{t('filter')}</Button>
                            <div className={styles.pageBox}>{currentPage}</div>
                            <span className={styles.mutedText}>{t('pageOf', { lastPage })}</span>
                            <div style={{ display: 'flex', gap: '0.125rem' }}>
                                <Button design="Transparent" icon="close-command-field" disabled={currentPage <= 1} />
                                <Button design="Transparent" icon="navigation-left-arrow" disabled={currentPage <= 1} />
                                <Button design="Transparent" icon="navigation-right-arrow" disabled={currentPage >= lastPage} />
                                <Button design="Transparent" icon="open-command-field" disabled={currentPage >= lastPage} />
                            </div>
                        </div>
                    </div>

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={tSystem('noTranslationProvidersFound')}
                    />
                </div>
            </div>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/system/translationProviders/${deleteId}`, {
                            onSuccess: () => setDeleteId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }}
                title={t('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tSystem('confirmDeleteTranslationProviderMessage')}
            </FioriMessageBox>
        </AppLayout>
    );
}
