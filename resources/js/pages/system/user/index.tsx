import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import CreateUserDialog from '@/components/system/create-user-dialog';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/copy.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, FlexBox, Icon, Input, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './index.module.css';

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

interface UserIndexProps {
    gridConfig: GridConfig;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
    managerOptions: { id: number; name: string }[];
}

export default function UserIndex({ gridConfig, gridData, filters, managerOptions }: UserIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('users'), href: '/system/user' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('users.create_users');
    const canEdit = permissions.includes('users.edit_users');
    const canDelete = permissions.includes('users.delete_users');

    const [search, setSearch] = useState(filters.search || '');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            router.get('/system/user', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    // Column pop-in priority (SAP Fiori responsive table): columns come from
    // the server-driven gridConfig, so priority falls out of column order —
    // the first (identifying) columns stay visible longest, less essential
    // columns reflow into the pop-in area first. Row actions stay pinned
    // like the identifying columns.
    type UserRow = UserIndexProps['gridData']['data'][number];
    const columns: FioriResponsiveColumn<UserRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row: UserRow) =>
            column.type === 'boolean' ? (
                <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
            ) : key === 'employee_id' || key === 'username' ? (
                <span style={{ fontWeight: 600 }}>{row[key] || '-'}</span>
            ) : (
                row[key] || '-'
            ),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: '',
            popinText: '',
            priority: 'always',
            align: 'right',
            render: (row: UserRow) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {visibleActions.map(([actionKey, action]) => {
                        if (actionKey === 'delete' && row.id === auth.user?.id) {
                            return null;
                        }

                        let iconName = 'edit';
                        if (action.icon === 'copy') iconName = 'copy';
                        if (action.icon === 'delete') iconName = 'delete';

                        const handleClick = () => {
                            if (actionKey === 'update') {
                                router.visit(`/system/user/${row.id}/edit`);
                            } else if (actionKey === 'delete') {
                                setDeleteUserId(row.id as number);
                            }
                        };

                        // ปุ่มไอคอน + ป้ายเล็กใต้ไอคอน (แบบเดิม) — UI5 Button วางข้อความใต้ไอคอนไม่ได้ เลยใช้ <button> ธรรมดา
                        return (
                            <button key={actionKey} type="button" className={styles.actionButton} onClick={handleClick}>
                                <Icon name={iconName} className={styles.actionIcon} />
                                <span className={styles.actionLabel}>{t(action.label)}</span>
                            </button>
                        );
                    })}
                </FlexBox>
            ),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('usersCount', { count: gridData.total })} />
            <div className={styles.page}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Start" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <Title level="H4" size="H4">
                            {tSystem('usersCount', { count: gridData.total })}
                        </Title>
                        <div style={{ marginTop: '1rem' }}>
                            <Input
                                placeholder={tSystem('searchByUsername')}
                                value={search}
                                icon={<Icon name="search" />}
                                onInput={(e) => setSearch(e.target.value)}
                                style={{ minWidth: 280 }}
                            />
                        </div>
                    </div>
                    {canCreate && (
                        <div>
                            <Button design="Emphasized" onClick={() => setCreateOpen(true)}>
                                {tSystem('createUser')}
                            </Button>
                        </div>
                    )}
                </FlexBox>

                <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} managerOptions={managerOptions} />

                <FioriResponsiveTable columns={columns} rows={gridData.data} getRowKey={(row: UserRow) => row.id} emptyMessage={t('noDataFound')} />
            </div>
            <FioriMessageBox
                open={deleteUserId !== null}
                onCancel={() => setDeleteUserId(null)}
                onConfirm={() => {
                    if (deleteUserId !== null) {
                        setDeleting(true);
                        router.delete(`/system/user/${deleteUserId}`, {
                            onSuccess: () => setDeleteUserId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }}
                title={tSystem('confirmDeletionTitle')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tSystem('confirmDeleteUserMessage')}
            </FioriMessageBox>
        </AppLayout>
    );
}
