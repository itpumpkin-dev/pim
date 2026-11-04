import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ScrollTopButton } from '@/components/scroll-top-button';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/search.js';
import { Button, FlexBox, Icon, Input, Text, Title } from '@ui5/webcomponents-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface GroupPermissionRow {
    id: number;
    permission_id: string;
    permission_name: string;
    module: string | null;
    roles: string;
}

interface UserGroupPermissionsProps {
    group: {
        id: number;
        code: string;
        name: string;
        is_active: boolean;
    };
    permissions: GroupPermissionRow[];
}

export default function UserGroupPermissions({ group, permissions }: UserGroupPermissionsProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('userGroups'), href: '/system/userGroup' },
        { title: group.name, href: `/system/userGroup/${group.id}/permissions` },
    ];

    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return permissions;
        return permissions.filter((row) =>
            [row.permission_id, row.permission_name, row.module ?? '', row.roles].some((value) => value.toLowerCase().includes(term)),
        );
    }, [permissions, search]);

    // Pop-in priority: the permission name identifies the row; the raw key
    // follows, and the description reflows into the pop-in area first.
    const columns: FioriResponsiveColumn<GroupPermissionRow>[] = [
        {
            key: 'id',
            header: tSystem('groupPermissionsId'),
            priority: 'high',
            width: 80,
            render: (row) => row.id,
        },
        {
            key: 'permissionId',
            header: tSystem('groupPermissionsPermissionId'),
            priority: 'medium',
            render: (row) => <span style={{ fontFamily: 'var(--sapFontFamilyMono, monospace)', fontSize: '0.8125rem' }}>{row.permission_id}</span>,
        },
        {
            key: 'permissionName',
            header: tSystem('groupPermissionsPermissionName'),
            priority: 'always',
            render: (row) => <span style={{ fontWeight: 600 }}>{row.permission_name}</span>,
        },
        {
            key: 'description',
            header: tSystem('groupPermissionsDescription'),
            priority: 'low',
            render: (row) => (
                <div>
                    {row.module && <div style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapTextColor)' }}>{row.module}</div>}
                    <span style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>
                        {tSystem('groupPermissionsViaRoles', { roles: row.roles })}
                    </span>
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('groupPermissionsGroupLabel', { name: group.name })} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <FlexBox justifyContent="SpaceBetween" alignItems="Start" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <FlexBox alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem' }}>
                            <Title level="H3">{tSystem('groupPermissionsGroupLabel', { name: group.name })}</Title>
                            <span style={{ color: 'var(--sapContent_LabelColor)' }}>({group.code})</span>
                            <FioriStatus label={group.is_active ? t('active') : t('inactive')} tone={group.is_active ? 'success' : 'neutral'} />
                        </FlexBox>
                        <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', marginTop: '0.5rem' }}>
                            *{tSystem('groupPermissionsSubtitle')}
                        </Text>
                        {!group.is_active && (
                            <Text style={{ display: 'block', color: 'var(--sapCriticalTextColor, var(--sapCriticalColor))', marginTop: '0.25rem' }}>
                                {tSystem('groupPermissionsInactiveNote')}
                            </Text>
                        )}
                    </div>
                    <Button icon="nav-back" onClick={() => router.visit('/system/userGroup')}>
                        {tSystem('groupPermissionsBack')}
                    </Button>
                </FlexBox>

                <FlexBox alignItems="Center" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1rem' }}>
                    <Input
                        placeholder={tSystem('searchByName')}
                        value={search}
                        onInput={(e) => setSearch(e.target.value)}
                        icon={<Icon name="search" />}
                        style={{ minWidth: 280 }}
                    />
                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('results', { count: filtered.length })}</Text>
                </FlexBox>

                <FioriResponsiveTable
                    columns={columns}
                    rows={filtered}
                    getRowKey={(row) => row.permission_id}
                    emptyMessage={search ? t('noDataFound') : tSystem('groupPermissionsEmpty')}
                />
            </div>
            <ScrollTopButton />
        </AppLayout>
    );
}
