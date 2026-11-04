import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { formatDateTime } from '@/lib/format';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, FlexBox, Icon, Input, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PaginationData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface GridConfig {
    columns: Record<
        string,
        {
            label: string;
            type: string;
            sortable?: boolean;
        }
    >;
    actions?: Record<
        string,
        {
            icon: string;
            label: string;
        }
    >;
}

interface RoleIndexProps {
    gridConfig: GridConfig;
    // server-driven gridConfig columns → row shape is dynamic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function RoleIndex({ gridConfig, gridData, filters }: RoleIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('roles'), href: '/system/roles' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('roles.create_roles');
    const canEdit = permissions.includes('roles.edit_roles');
    const canDelete = permissions.includes('roles.delete_roles');

    const [search, setSearch] = useState(filters.search || '');
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    const confirmDelete = () => {
        if (!deleteTarget) return;

        setDeleting(true);
        router.delete(`/system/roles/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setDeleteTarget(null);
            },
        });
    };

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            router.get('/system/roles', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    // Column pop-in priority (SAP Fiori responsive table): the role name
    // identifies the row and always stays, code/status follow as space
    // allows, and the audit columns (created/updated on/by) reflow into the
    // pop-in area first. Row actions stay pinned like the identifying column.
    type RoleRow = RoleIndexProps['gridData']['data'][number];
    const columnPriority: Record<string, FioriResponsiveColumn<RoleRow>['priority']> = {
        label: 'always',
        code: 'high',
        is_active: 'medium',
    };
    const rowOffset = (gridData.current_page - 1) * gridData.per_page;
    const columns: FioriResponsiveColumn<RoleRow>[] = [
        {
            key: 'rowNumber',
            header: t('fields.rowNumber'),
            priority: 'high',
            width: 80,
            render: (row) => rowOffset + gridData.data.indexOf(row) + 1,
        },
        ...Object.entries(gridConfig.columns).map(
            ([key, column]): FioriResponsiveColumn<RoleRow> => ({
                key,
                header: t(column.label),
                priority: columnPriority[key] ?? 'low',
                render: (row) =>
                    key === 'is_guest' ? (
                        // A flag, not a status — yes/no rather than active/inactive.
                        <FioriStatus label={row[key] ? t('yes') : t('no')} tone={row[key] ? 'information' : 'neutral'} />
                    ) : column.type === 'boolean' ? (
                        <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
                    ) : column.type === 'datetime' ? (
                        formatDateTime(row[key])
                    ) : key === 'label' ? (
                        <span style={{ fontWeight: 600 }}>{row[key] || '-'}</span>
                    ) : (
                        row[key] || '-'
                    ),
            }),
        ),
    ];

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {visibleActions.map(([actionKey, action]) => {
                        if (actionKey === 'delete' && row.label === 'Administrator') {
                            return null;
                        }

                        let icon = 'edit';
                        if (action.icon === 'copy') icon = 'copy';
                        if (action.icon === 'delete') icon = 'delete';

                        const handleClick = () => {
                            if (actionKey === 'update') {
                                router.visit(`/system/roles/${row.id}/edit`);
                            }
                            if (actionKey === 'delete') {
                                setDeleteTarget({ id: row.id, label: row.label });
                            }
                        };

                        return (
                            <Button
                                key={actionKey}
                                design="Transparent"
                                icon={icon}
                                tooltip={t(action.label)}
                                accessibleName={t(action.label)}
                                onClick={handleClick}
                            />
                        );
                    })}
                </FlexBox>
            ),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('rolesCount', { count: gridData.total })} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Start" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H3">{tSystem('rolesCount', { count: gridData.total })}</Title>
                        <div style={{ marginTop: '1rem' }}>
                            <Input
                                placeholder={tSystem('searchByName')}
                                value={search}
                                onInput={(e) => setSearch(e.target.value)}
                                icon={<Icon name="search" />}
                                style={{ minWidth: 280 }}
                            />
                        </div>
                    </div>
                    {canCreate && (
                        <Button design="Emphasized" onClick={() => router.visit('/system/roles/create')}>
                            {tSystem('createRole')}
                        </Button>
                    )}
                </FlexBox>

                <div style={{ marginTop: '2rem' }}>
                    <FioriResponsiveTable columns={columns} rows={gridData.data} getRowKey={(row) => row.id} emptyMessage={t('noDataFound')} />
                </div>
            </div>

            <FioriMessageBox
                open={Boolean(deleteTarget)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title={tSystem('deleteRoleTitle')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tSystem('confirmDeleteRoleMessage', { label: deleteTarget?.label })}
            </FioriMessageBox>
        </AppLayout>
    );
}
