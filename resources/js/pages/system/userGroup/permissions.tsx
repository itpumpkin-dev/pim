import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Box, Button, InputAdornment, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ScrollTopButton } from '@/components/scroll-top-button';
import { FIORI, FioriStatus, fioriDefaultSx, fioriSearchFieldSx } from '@/lib/fiori-style';

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
            render: (row) => (
                <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {row.permission_id}
                </Typography>
            ),
        },
        {
            key: 'permissionName',
            header: tSystem('groupPermissionsPermissionName'),
            priority: 'always',
            render: (row) => (
                <Typography component="span" fontWeight={600}>
                    {row.permission_name}
                </Typography>
            ),
        },
        {
            key: 'description',
            header: tSystem('groupPermissionsDescription'),
            priority: 'low',
            render: (row) => (
                <Box>
                    {row.module && <Typography variant="body2">{row.module}</Typography>}
                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                        {tSystem('groupPermissionsViaRoles', { roles: row.roles })}
                    </Typography>
                </Box>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('groupPermissionsGroupLabel', { name: group.name })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                {tSystem('groupPermissionsGroupLabel', { name: group.name })}
                            </Typography>
                            <Typography component="span" sx={{ color: FIORI.textSecondary }}>
                                ({group.code})
                            </Typography>
                            <FioriStatus label={group.is_active ? t('active') : t('inactive')} tone={group.is_active ? 'success' : 'neutral'} />
                        </Box>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 1 }}>
                            *{tSystem('groupPermissionsSubtitle')}
                        </Typography>
                        {!group.is_active && (
                            <Typography variant="body2" sx={{ color: FIORI.warning, mt: 0.5 }}>
                                {tSystem('groupPermissionsInactiveNote')}
                            </Typography>
                        )}
                    </Box>
                    <Button
                        variant="contained"
                        color="inherit"
                        startIcon={<ArrowBackIcon />}
                        sx={{ ...fioriDefaultSx, px: 2.5, py: 1 }}
                        onClick={() => router.visit('/system/userGroup')}
                    >
                        {tSystem('groupPermissionsBack')}
                    </Button>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <TextField
                        placeholder={tSystem('searchByName')}
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ ...fioriSearchFieldSx, minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                        {t('results', { count: filtered.length })}
                    </Typography>
                </Box>

                <FioriResponsiveTable
                    columns={columns}
                    rows={filtered}
                    getRowKey={(row) => row.permission_id}
                    emptyMessage={search ? t('noDataFound') : tSystem('groupPermissionsEmpty')}
                />
            </Box>
            <ScrollTopButton />
        </AppLayout>
    );
}
