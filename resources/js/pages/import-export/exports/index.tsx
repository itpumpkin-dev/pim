import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import PagePagination from '@/components/import-export/page-pagination';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/play.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, Icon, Input, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

interface ExportConfigItem {
    id: number;
    code: string;
    type: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    configs: PaginatedData<ExportConfigItem>;
    filters: { search?: string };
}

export default function ExportIndex({ configs, filters }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('exportsTitle'), href: '/import-export/exports' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('export_configs.create_export_configs');
    const canEdit = permissions.includes('export_configs.edit_export_configs');
    const canDelete = permissions.includes('export_configs.delete_export_configs');
    const canRun = permissions.includes('export_configs.edit_export_configs');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [runningId, setRunningId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/import-export/exports', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (page: number) => {
        router.get('/import-export/exports', { search, page }, { preserveState: true });
    };

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    // Column pop-in priority (SAP Fiori responsive table): the config code
    // is the identifying column and stays visible at every width; the type
    // is secondary metadata that reflows into the pop-in area first, and the
    // numeric ID is the least useful on a phone. Row actions stay pinned
    // like the identifying column.
    const columns: FioriResponsiveColumn<ExportConfigItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: 'Code',
            priority: 'always',
            render: (row) => <span className={styles.mono}>{row.code}</span>,
        },
        {
            key: 'type',
            header: t('typeLabel'),
            priority: 'medium',
            render: (row) => typeLabel(row.type),
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    {canRun && (
                        <Button
                            design="Transparent"
                            icon="play"
                            tooltip={t('exportNow')}
                            accessibleName={t('exportNow')}
                            disabled={runningId === row.id}
                            loading={runningId === row.id}
                            loadingDelay={0}
                            onClick={() => {
                                setRunningId(row.id);
                                router.post(
                                    `/import-export/exports/${row.id}/run`,
                                    {},
                                    {
                                        onFinish: () => setRunningId(null),
                                    },
                                );
                            }}
                        />
                    )}
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            tooltip={tGrid('rowActions.edit')}
                            accessibleName={tGrid('rowActions.edit')}
                            onClick={() => router.visit(`/import-export/exports/${row.id}/edit`)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            tooltip={tGrid('rowActions.delete')}
                            accessibleName={tGrid('rowActions.delete')}
                            onClick={() => setDeleteId(row.id)}
                        />
                    )}
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('exportsTitle')} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <Title level="H3" size="H3" wrappingType="Normal">
                            {t('exportsTitle')}
                        </Title>
                        <div className={styles.secondaryText} style={{ marginTop: '0.125rem' }}>
                            {tGrid('results', { count: configs.total })}
                        </div>
                    </div>
                    {canCreate && (
                        <Button design="Emphasized" icon="add" onClick={() => router.visit('/import-export/exports/create')}>
                            {t('createExport')}
                        </Button>
                    )}
                </div>

                <div className={styles.card}>
                    <div className={styles.toolbar}>
                        <Input
                            value={search}
                            onInput={(event) => setSearch(event.target.value)}
                            placeholder={t('searchExports')}
                            showClearIcon
                            icon={<Icon name="search" />}
                            style={{ minWidth: 280, maxWidth: '100%' }}
                        />
                    </div>

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={configs.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noExportsFound')}
                    />
                </div>

                {configs.last_page > 1 && <PagePagination count={configs.last_page} page={configs.current_page} onChange={handlePageChange} />}
            </div>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/import-export/exports/${deleteId}`, {
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
                {t('confirmDeleteExport')}
            </FioriMessageBox>
        </AppLayout>
    );
}
