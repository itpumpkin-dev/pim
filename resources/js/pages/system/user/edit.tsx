import { TimelinePanel } from '@/components/timeline-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogContent,
    FormControlLabel,
    IconButton,
    MenuItem,
    Select,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { ChangeEvent, FormEventHandler, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface UserGroupOption {
    id: number;
    name: string;
}

interface RoleOption {
    id: number;
    label: string;
}

interface PermissionEntry {
    resource: string;
    action: string;
}

interface RoleSummary {
    id: number;
    label: string;
    permissions: PermissionEntry[];
}

interface GroupSummary {
    id: number;
    name: string;
    roles: RoleSummary[];
}

interface UserPermissions {
    roles: RoleSummary[];
    groups: GroupSummary[];
    effective_permissions: string[];
}

interface LocaleOption {
    id: number;
    code: string;
}

interface DepartmentOption {
    id: number;
    name: string;
}

interface JobPositionOption {
    id: number;
    name: string;
}

interface EditUserProps {
    user: {
        id: number;
        name: string;
        name_prefix: string | null;
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string;
        department_id: number | null;
        job_position_id: number | null;
        manager_id: number | null;
        enabled: boolean;
        avatar_url: string | null;
        ui_locale_id: number | null;
        timezone: string;
        created_at: string;
        updated_at: string;
        last_login_at: string | null;
        login_count: number;
        group_ids: number[];
        role_ids: number[];
    };
    groups: UserGroupOption[];
    roles: RoleOption[];
    localeOptions: LocaleOption[];
    timezones: string[];
    departments: DepartmentOption[];
    jobPositions: JobPositionOption[];
    managerOptions: { id: number; name: string }[];
    /** effective "resource.action" list per candidate manager, for the excess-permission warning */
    managerPermissionsById: Record<number, string[]>;
    canManageAccess: boolean;
    permissions: UserPermissions;
}

interface UserForm {
    name_prefix: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    department_id: number | '';
    job_position_id: number | '';
    manager_id: number | '';
    enabled: boolean;
    avatar: File | null;
    password: string;
    password_confirmation: string;
    ui_locale_id: number | '';
    timezone: string;
    _method?: string;
    [key: string]: string | boolean | number | number[] | File | null | undefined;
}

// Stable identifiers for tab state — kept separate from the *displayed*
// (translated) label, since the label can change out from under an already-
// selected tab if the user switches UI language while this page is open
// (see useLocale()'s instant, no-reload language switch).
const TAB_KEYS = ['general', 'groupsAndRoles', 'permissions', 'timeline', 'password', 'interfaces'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function humanize(value: string): string {
    return value
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

let localeDisplay: Intl.DisplayNames | null = null;
try {
    localeDisplay = new Intl.DisplayNames(['en'], { type: 'language' });
} catch {
    localeDisplay = null;
}

function localeLabel(code: string) {
    try {
        return localeDisplay?.of(code.replace('_', '-')) ?? code;
    } catch {
        return code;
    }
}

export default function UserEdit({
    user,
    groups,
    roles,
    localeOptions,
    timezones,
    departments,
    jobPositions,
    managerOptions,
    managerPermissionsById,
    canManageAccess,
    permissions,
}: EditUserProps) {
    const { t } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');

    // Anyone can open their own account here (it's the "Settings" page from the
    // user menu), but the user list at /system/user is gated by
    // `users.list_users`. Without it, sending them there — via the breadcrumb or
    // Cancel — lands on a 403 page, so fall back to the dashboard, which every
    // signed-in user can reach.
    const { auth } = usePage<SharedData>().props;
    const viewerPermissions = auth.permissions ?? [];
    const canListUsers = viewerPermissions.includes('users.list_users');
    const cancelHref = canListUsers ? '/system/user' : '/dashboard';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('users'), href: canListUsers ? '/system/user' : '#' },
    ];

    const tabLabels: Record<TabKey, string> = {
        general: t('tabGeneralProperties'),
        groupsAndRoles: t('tabGroupsAndRoles'),
        permissions: t('tabPermissions'),
        timeline: t('tabTimeline'),
        password: t('tabPassword'),
        interfaces: t('tabInterfaces'),
    };
    const tabs = canManageAccess ? TAB_KEYS : TAB_KEYS.filter((key) => key !== 'groupsAndRoles');
    const [tab, setTab] = useState<TabKey>(tabs[0]);

    const formatDateTime = (value: string | null) => {
        if (!value) return t('never');
        return new Date(value).toLocaleString('en-US');
    };

    const permissionRows = useMemo(() => {
        const rows = new Map<string, { resource: string; action: string; sources: string[] }>();

        const add = (permission: PermissionEntry, source: string) => {
            const key = `${permission.resource}.${permission.action}`;
            const existing = rows.get(key);
            if (existing) {
                if (!existing.sources.includes(source)) existing.sources.push(source);
            } else {
                rows.set(key, { resource: permission.resource, action: permission.action, sources: [source] });
            }
        };

        permissions.roles.forEach((role) => {
            role.permissions.forEach((permission) => add(permission, t('grantedViaRole', { label: role.label })));
        });
        permissions.groups.forEach((group) => {
            group.roles.forEach((role) => {
                role.permissions.forEach((permission) => add(permission, t('grantedViaGroupRole', { group: group.name, role: role.label })));
            });
        });

        return Array.from(rows.values()).sort(
            (a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action),
        );
    }, [permissions, t]);

    // Column pop-in priority (SAP Fiori responsive table): resource
    // identifies the row and always stays; action follows as space allows;
    // "granted via" (a wrapping list of source chips) reflows first since
    // it's the least compact/least essential of the three.
    type PermissionRow = (typeof permissionRows)[number];
    const permissionColumns: FioriResponsiveColumn<PermissionRow>[] = [
        {
            key: 'resource',
            header: t('resource'),
            priority: 'always',
            render: (row) => humanize(row.resource),
        },
        {
            key: 'action',
            header: t('action'),
            priority: 'high',
            render: (row) => humanize(row.action),
        },
        {
            key: 'grantedVia',
            header: t('grantedVia'),
            priority: 'medium',
            render: (row) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {row.sources.map((source) => (
                        <Chip
                            key={source}
                            label={source}
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: FIORI.border, borderRadius: '6px', color: FIORI.textPrimary }}
                        />
                    ))}
                </Box>
            ),
        },
    ];
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
    const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data, setData, post, processing, errors, clearErrors, isDirty } = useForm<UserForm>({
        _method: 'put',
        name_prefix: user.name_prefix || '',
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone || '',
        email: user.email,
        department_id: user.department_id ?? '',
        job_position_id: user.job_position_id ?? '',
        manager_id: user.manager_id ?? '',
        enabled: user.enabled,
        avatar: null,
        password: '',
        password_confirmation: '',
        ui_locale_id: user.ui_locale_id ?? '',
        timezone: user.timezone,
    });

    // The "Groups and Roles" tab saves on its own PUT (system.user.updateAccess),
    // independent of the main profile form above — so its fields live in their
    // own useForm with their own dirty/processing/errors state.
    const accessForm = useForm<{ groups: number[]; roles: number[] }>({
        groups: user.group_ids,
        roles: user.role_ids,
    });

    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty || accessForm.isDirty);

    const update = (key: keyof UserForm, value: UserForm[keyof UserForm]) => {
        setData(key, value);
        clearErrors(key as string);
    };

    // Permissions this user has that the chosen manager doesn't — a heads-up
    // that the reporting line puts someone under a manager with less access
    // than their own report. Warning only; it never blocks saving.
    const managerExcessPermissions = useMemo(() => {
        if (data.manager_id === '') return [];
        const managerPerms = new Set(managerPermissionsById[data.manager_id] ?? []);
        return permissions.effective_permissions.filter((p) => !managerPerms.has(p));
    }, [data.manager_id, managerPermissionsById, permissions.effective_permissions]);

    const [copyingAccess, setCopyingAccess] = useState(false);

    // "Give the manager these too": mirror this user's groups + directly-
    // assigned roles onto the selected manager right away (separate PUT).
    // preserveState keeps the form as-is; the refreshed managerPermissionsById
    // prop makes the warning recompute.
    const copyAccessToManager = () => {
        if (data.manager_id === '') return;
        const managerName = managerOptions.find((o) => o.id === data.manager_id)?.name ?? '';
        if (!window.confirm(t('copyRolesToManagerConfirm', { name: managerName }))) return;

        setCopyingAccess(true);
        router.put(
            route('system.user.copyAccessToManager', user.id),
            { manager_id: data.manager_id },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setCopyingAccess(false),
            },
        );
    };

    const saveAccess = () => {
        skipNavigationGuardRef.current = true;
        accessForm.put(route('system.user.updateAccess', user.id), {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const performSubmit = () => {
        skipNavigationGuardRef.current = true;
        post(route('system.user.update', user.id), {
            forceFormData: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        performSubmit();
    };

    const cancel = () => router.visit(cancelHref);

    const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            update('avatar', file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('editUserTitle', { name: user.name })} />
            <Box
                component="form"
                id="user-edit-form"
                onSubmit={submit}
                sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', bgcolor: FIORI.pageBg }}
            >
                <Box sx={{ flex: 1, p: 4 }}>
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Box
                        onClick={() => avatarPreview && setAvatarViewerOpen(true)}
                        sx={{
                            width: 72,
                            height: 72,
                            borderRadius: '8px',
                            border: `2px solid ${FIORI.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0,
                            cursor: avatarPreview ? 'pointer' : 'default',
                        }}
                    >
                        {avatarPreview ? (
                            <Box component="img" src={avatarPreview} alt={user.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <ImageIcon sx={{ fontSize: 36 }} />
                        )}
                    </Box>

                    <Dialog open={avatarViewerOpen} onClose={() => setAvatarViewerOpen(false)} maxWidth="sm">
                        <IconButton
                            onClick={() => setAvatarViewerOpen(false)}
                            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                        <DialogContent sx={{ p: 0, display: 'flex' }}>
                            {avatarPreview && (
                                <Box
                                    component="img"
                                    src={avatarPreview}
                                    alt={user.name}
                                    sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {user.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            {t('createdLabel')}: {formatDateTime(user.created_at)} {t('updatedLabel')}: {formatDateTime(user.updated_at)} {t('lastLoggedInLabel')}:{' '}
                            {formatDateTime(user.last_login_at)} {t('loginCountLabel')}: {user.login_count}
                        </Typography>
                    </Box>
                </Box>

                <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}>
                    {tabs.map((key) => (
                        <Tab key={key} label={tabLabels[key]} value={key} />
                    ))}
                </Tabs>

                {tab === 'general' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        {canManageAccess && (
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    {t('statusRequired')}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <FormControlLabel
                                        control={<Checkbox checked={data.enabled} onChange={() => update('enabled', true)} />}
                                        label={t('active')}
                                    />
                                    <FormControlLabel
                                        control={<Checkbox checked={!data.enabled} onChange={() => update('enabled', false)} />}
                                        label={t('nonActive')}
                                    />
                                </Box>
                            </Box>
                        )}

                        {/* <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                Name prefix
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.name_prefix}
                                onChange={(e) => update('name_prefix', e.target.value)}
                                error={Boolean(errors.name_prefix)}
                                helperText={errors.name_prefix}
                            />
                        </Box> */}

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('firstNameRequired')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.first_name}
                                onChange={(e) => update('first_name', e.target.value)}
                                error={Boolean(errors.first_name)}
                                helperText={errors.first_name}
                            />
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('lastNameRequired')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.last_name}
                                onChange={(e) => update('last_name', e.target.value)}
                                error={Boolean(errors.last_name)}
                                helperText={errors.last_name}
                            />
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('phone')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.phone}
                                onChange={(e) => update('phone', e.target.value.slice(0, 10))}
                                error={Boolean(errors.phone)}
                                helperText={errors.phone}
                                slotProps={{ htmlInput: { maxLength: 10 } }}
                            />
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('department')}
                            </Typography>
                            <Select
                                fullWidth
                                size="small"
                                displayEmpty
                                value={data.department_id}
                                onChange={(e) => update('department_id', e.target.value === '' ? '' : Number(e.target.value))}
                                error={Boolean(errors.department_id)}
                            >
                                <MenuItem value="">—</MenuItem>
                                {departments.map((department) => (
                                    <MenuItem key={department.id} value={department.id}>
                                        {department.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('jobPosition')}
                            </Typography>
                            <Select
                                fullWidth
                                size="small"
                                displayEmpty
                                value={data.job_position_id}
                                onChange={(e) => update('job_position_id', e.target.value === '' ? '' : Number(e.target.value))}
                                error={Boolean(errors.job_position_id)}
                            >
                                <MenuItem value="">—</MenuItem>
                                {jobPositions.map((jobPosition) => (
                                    <MenuItem key={jobPosition.id} value={jobPosition.id}>
                                        {jobPosition.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>

                        {canManageAccess && (
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    {t('reportsTo')}
                                </Typography>
                                <Select
                                    fullWidth
                                    size="small"
                                    displayEmpty
                                    value={data.manager_id}
                                    onChange={(e) => update('manager_id', e.target.value === '' ? '' : Number(e.target.value))}
                                    error={Boolean(errors.manager_id)}
                                >
                                    <MenuItem value="">—</MenuItem>
                                    {managerOptions.map((option) => (
                                        <MenuItem key={option.id} value={option.id}>
                                            {option.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {Boolean(errors.manager_id) && (
                                    <Typography variant="caption" color="error">
                                        {errors.manager_id}
                                    </Typography>
                                )}
                                {managerExcessPermissions.length > 0 && (
                                    <Alert severity="warning" sx={{ mt: 1 }}>
                                        {t('managerExcessPermissionsWarning', { count: managerExcessPermissions.length })}
                                        <Box component="ul" sx={{ m: '4px 0 0', pl: 2.5 }}>
                                            {managerExcessPermissions.slice(0, 8).map((p) => (
                                                <li key={p}>{p}</li>
                                            ))}
                                            {managerExcessPermissions.length > 8 && (
                                                <li>
                                                    {t('andNMore', { count: managerExcessPermissions.length - 8 })}
                                                </li>
                                            )}
                                        </Box>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="warning"
                                            disabled={copyingAccess}
                                            startIcon={copyingAccess ? <CircularProgress size={14} color="inherit" /> : undefined}
                                            onClick={copyAccessToManager}
                                            sx={{ mt: 1 }}
                                        >
                                            {t('copyRolesToManager')}
                                        </Button>
                                    </Alert>
                                )}
                            </Box>
                        )}

                        <Box
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                border: `2px dashed ${FIORI.border}`,
                                borderRadius: '8px',
                                p: 3,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 1,
                                cursor: 'pointer',
                            }}
                        >
                            <ImageIcon sx={{ fontSize: 32, color: FIORI.textSecondary }} />
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('dragDropUpload')}
                            </Typography>
                            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                        </Box>
                        {Boolean(errors.avatar) && (
                            <Typography variant="caption" color="error">
                                {errors.avatar}
                            </Typography>
                        )}

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('emailRequired')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                type="email"
                                value={data.email}
                                onChange={(e) => update('email', e.target.value)}
                                error={Boolean(errors.email)}
                                helperText={errors.email}
                            />
                        </Box>
                    </Box>
                )}

                {tab === 'groupsAndRoles' && canManageAccess && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 500 }}>
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            {t('groupsOrRolesHint')}
                        </Typography>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('userGroups')}
                            </Typography>
                            <Autocomplete
                                multiple
                                size="small"
                                options={groups}
                                getOptionLabel={(option) => option.name}
                                value={groups.filter((g) => accessForm.data.groups.includes(g.id))}
                                onChange={(_, value) => {
                                    accessForm.setData('groups', value.map((v) => v.id));
                                    accessForm.clearErrors('groups');
                                }}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => <Chip label={option.name} {...getTagProps({ index })} key={option.id} />)
                                }
                                renderInput={(params) => <TextField {...params} error={Boolean(accessForm.errors.groups)} helperText={accessForm.errors.groups} />}
                            />
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('roles')}
                            </Typography>
                            <Autocomplete
                                multiple
                                size="small"
                                options={roles}
                                getOptionLabel={(option) => option.label}
                                value={roles.filter((r) => accessForm.data.roles.includes(r.id))}
                                onChange={(_, value) => {
                                    accessForm.setData('roles', value.map((v) => v.id));
                                    accessForm.clearErrors('roles');
                                }}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => <Chip label={option.label} {...getTagProps({ index })} key={option.id} />)
                                }
                                renderInput={(params) => <TextField {...params} error={Boolean(accessForm.errors.roles)} helperText={accessForm.errors.roles} />}
                            />
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <Button
                                type="button"
                                onClick={saveAccess}
                                variant="contained"
                                disabled={accessForm.processing || !accessForm.isDirty}
                                startIcon={accessForm.processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{ ...fioriEmphasizedSx, px: 4 }}
                            >
                                {accessForm.processing ? t('saving').toUpperCase() : t('saveGroupsAndRoles').toUpperCase()}
                            </Button>
                        </Box>
                    </Box>
                )}

                {tab === 'permissions' && (
                    <Box sx={{ maxWidth: 800 }}>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mb: 2 }}>
                            {t('permissionsDescription')}
                        </Typography>
                        <FioriResponsiveTable
                            size="small"
                            columns={permissionColumns}
                            rows={permissionRows}
                            getRowKey={(row) => `${row.resource}.${row.action}`}
                            emptyMessage={t('noPermissionsAssigned')}
                        />
                    </Box>
                )}

                {tab === 'timeline' && (
                    <Box sx={{ maxWidth: 700 }}>
                        <TimelinePanel timelineUrl={route('system.user.history', user.id)} />
                    </Box>
                )}

                {tab === 'password' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('newPassword')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                type="password"
                                autoComplete="new-password"
                                value={data.password}
                                onChange={(e) => update('password', e.target.value)}
                                error={Boolean(errors.password)}
                                helperText={errors.password}
                            />
                        </Box>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('newPasswordRepeat')}
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                type="password"
                                autoComplete="new-password"
                                value={data.password_confirmation}
                                onChange={(e) => update('password_confirmation', e.target.value)}
                            />
                        </Box>
                    </Box>
                )}

                {tab === 'interfaces' && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('uiLocale')}
                            </Typography>
                            <Select
                                fullWidth
                                size="small"
                                value={data.ui_locale_id}
                                onChange={(e) => update('ui_locale_id', Number(e.target.value))}
                                error={Boolean(errors.ui_locale_id)}
                            >
                                {localeOptions.map((locale) => (
                                    <MenuItem key={locale.id} value={locale.id}>
                                        {localeLabel(locale.code)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('timezoneRequired')}
                            </Typography>
                            <Select fullWidth size="small" value={data.timezone} onChange={(e) => update('timezone', e.target.value)} error={Boolean(errors.timezone)}>
                                {timezones.map((tz) => (
                                    <MenuItem key={tz} value={tz}>
                                        {tz}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                    </Box>
                )}
                </Box>

                {/* Fiori footer action bar — ปุ่มอยู่ล่างสุด ติดขอบ ไม่ใช่บน header */}
                <Box
                    sx={{
                        position: 'sticky',
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 1,
                        px: 4,
                        py: 2,
                        bgcolor: FIORI.surface,
                        borderTop: `1px solid ${FIORI.border}`,
                    }}
                >
                    <Button type="button" onClick={cancel} variant="contained" color="inherit" sx={{ ...fioriDefaultSx, px: 4 }}>
                        {t('cancel').toUpperCase()}
                    </Button>
                    <Button
                        type="button"
                        onClick={performSubmit}
                        variant="contained"
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ ...fioriEmphasizedSx, px: 4 }}
                    >
                        {processing ? t('saving').toUpperCase() : t('save').toUpperCase()}
                    </Button>
                </Box>
            </Box>
        </AppLayout>
    );
}
