import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import { BusyIndicator, Button, FlexBox, Icon, Input, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ApiSourceRow {
    id: number;
    name: string;
    endpoint: string;
    auth_type: string;
    is_active: boolean;
    [key: string]: unknown;
}
interface GridData {
    data: ApiSourceRow[];
    total: number;
    current_page?: number;
    last_page?: number;
}
interface Props {
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function AttributeApiSourceIndex({ gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
        { title: tNav('attributeApiSources'), href: '/catalog/attributes/api-sources' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_api_sources.create_attribute_api_sources');
    const canEdit = permissions.includes('attribute_api_sources.edit_attribute_api_sources');
    const canDelete = permissions.includes('attribute_api_sources.delete_attribute_api_sources');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const [testMessage, setTestMessage] = useState<{ id: number; ok: boolean; text: string } | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributes/api-sources', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const runTest = (row: ApiSourceRow) => {
        setTestingId(row.id);
        setTestMessage(null);
        fetch(`/catalog/attributes/api-sources/${row.id}/test`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok) {
                    setTestMessage({ id: row.id, ok: false, text: tCatalog('testConnectionFailed', { error: json.error ?? '' }) });
                    return;
                }
                const rows = json.rows ?? [];
                setTestMessage({
                    id: row.id,
                    ok: rows.length > 0,
                    text: rows.length > 0 ? tCatalog('testConnectionSuccess', { count: rows.length }) : tCatalog('testConnectionEmpty'),
                });
            })
            .catch(() => setTestMessage({ id: row.id, ok: false, text: 'Network error' }))
            .finally(() => setTestingId(null));
    };

    const columns: FioriResponsiveColumn<ApiSourceRow>[] = [
        {
            key: 'name',
            header: t('fields.name'),
            priority: 'always',
            render: (row) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
        },
        {
            key: 'endpoint',
            header: t('fields.endpoint'),
            priority: 'high',
            render: (row) => <span style={{ wordBreak: 'break-all', fontSize: 'var(--sapFontSize)' }}>{row.endpoint}</span>,
        },
        {
            key: 'auth_type',
            header: t('fields.authType'),
            priority: 'medium',
            render: (row) => row.auth_type,
        },
        {
            key: 'status',
            header: t('fields.status'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.is_active ? t('enabled') : t('disabled')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <FlexBox justifyContent="End" alignItems="Center" style={{ gap: '0.25rem' }}>
                    {testingId === row.id ? (
                        <BusyIndicator active size="S" style={{ padding: '0 0.5rem' }} />
                    ) : (
                        <Button
                            design="Transparent"
                            icon="synchronize"
                            tooltip={t('rowActions.test')}
                            accessibleName={t('rowActions.test')}
                            onClick={() => runTest(row)}
                        />
                    )}
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            tooltip={t('rowActions.edit')}
                            accessibleName={t('rowActions.edit')}
                            onClick={() => router.visit(`/catalog/attributes/api-sources/${row.id}/edit`)}
                        />
                    )}
                    {canDelete && (
                        <Button
                            design="Transparent"
                            icon="delete"
                            tooltip={t('rowActions.delete')}
                            accessibleName={t('rowActions.delete')}
                            onClick={() => setDeleteId(row.id)}
                        />
                    )}
                </FlexBox>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributeApiSourcesTitle')} />
            <div style={{ padding: 'clamp(1rem, 3vw, 2rem)', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H3">{tCatalog('attributeApiSourcesTitle')}</Title>
                        <Text style={{ color: 'var(--sapContent_LabelColor)', marginTop: '0.125rem', display: 'block' }}>
                            {t('results', { count: gridData.total })}
                        </Text>
                    </div>
                    {canCreate && (
                        <Button design="Emphasized" icon="add" onClick={() => router.visit('/catalog/attributes/api-sources/create')}>
                            {tCatalog('createAttributeApiSource')}
                        </Button>
                    )}
                </FlexBox>

                {testMessage && (
                    <FioriMessageStrip severity={testMessage.ok ? 'success' : 'error'} style={{ marginBottom: '1rem' }}>
                        {testMessage.text}
                    </FioriMessageStrip>
                )}

                <div
                    style={{
                        background: 'var(--sapGroup_ContentBackground)',
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        overflow: 'hidden',
                    }}
                >
                    <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', padding: '1rem' }}>
                        <Input
                            value={search}
                            onInput={(event) => setSearch(event.target.value)}
                            placeholder={tCatalog('searchAttributeApiSources')}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 240 }}
                        />
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>
                            {t('pageOf', { lastPage })} ({currentPage})
                        </Text>
                    </FlexBox>

                    <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }} />

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={tCatalog('noAttributeApiSourcesFound')}
                    />
                </div>
            </div>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributes/api-sources/${deleteId}`, {
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
                {tCatalog('confirmDeleteAttributeApiSourceMessage')}
            </FioriMessageBox>
        </AppLayout>
    );
}
