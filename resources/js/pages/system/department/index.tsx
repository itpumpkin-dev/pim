import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, FlexBox, Icon, Input, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

interface DepartmentIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<GridRow>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

type GridRow = { id: number; name: string; [key: string]: unknown };

const actionIcon = (icon: string) => (icon === 'copy' ? 'copy' : icon === 'delete' ? 'delete' : 'edit');

export default function DepartmentIndex({ gridConfig, gridData, filters }: DepartmentIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('departments'), href: '/system/department' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('departments.create_departments');
    const canEdit = permissions.includes('departments.edit_departments');
    const canDelete = permissions.includes('departments.delete_departments');

    const [search, setSearch] = useState(filters.search || '');
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    // Column pop-in priority (SAP Fiori responsive table): this grid's
    // columns come from the server-driven gridConfig rather than a fixed
    // list, so priority falls out of column order — the first column
    // identifies the row and always stays, the next two follow as space
    // allows, and the rest reflow into the pop-in area first. Row actions
    // stay pinned like the identifying column since they're always reachable
    // in Fiori's pattern too.
    type DepartmentRow = GridRow;
    const columns: FioriResponsiveColumn<DepartmentRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row: DepartmentRow) =>
            column.type === 'boolean' ? (
                <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
            ) : (
                <Text style={{ fontWeight: key === 'name' ? 600 : 400 }}>{(row[key] as ReactNode) || '-'}</Text>
            ),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row: DepartmentRow) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {visibleActions.map(([actionKey, action]) => {
                        const handleClick = () => {
                            if (actionKey === 'update') {
                                router.visit(`/system/department/${row.id}/edit`);
                            }
                            if (actionKey === 'delete') {
                                setDeleteTarget({ id: row.id, name: row.name });
                            }
                        };

                        return (
                            <Button
                                key={actionKey}
                                design="Transparent"
                                icon={actionIcon(action.icon)}
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

    const confirmDelete = () => {
        if (!deleteTarget) return;

        setDeleting(true);
        router.delete(`/system/department/${deleteTarget.id}`, {
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
            router.get('/system/department', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('departmentsCount', { count: gridData.total })} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Start" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <Title level="H3" wrappingType="Normal">
                        {tSystem('departmentsCount', { count: gridData.total })}
                    </Title>
                    {canCreate && (
                        <Button design="Emphasized" onClick={() => router.visit('/system/department/create')}>
                            {tSystem('createDepartment')}
                        </Button>
                    )}
                </FlexBox>

                <div
                    style={{
                        background: 'var(--sapGroup_ContentBackground)',
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        overflow: 'hidden',
                    }}
                >
                    <FlexBox alignItems="Center" style={{ gap: '0.75rem', padding: '1rem' }}>
                        <Input
                            placeholder={tSystem('searchByName')}
                            value={search}
                            onInput={(e) => setSearch(e.target.value)}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 300, maxWidth: '100%' }}
                        />
                    </FlexBox>

                    <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }} />

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noDataFound')}
                    />
                </div>
            </div>

            <FioriMessageBox
                open={Boolean(deleteTarget)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={confirmDelete}
                title={tSystem('deleteDepartmentTitle')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tSystem('confirmDeleteDepartmentMessage', { name: deleteTarget?.name })}
            </FioriMessageBox>
        </AppLayout>
    );
}
