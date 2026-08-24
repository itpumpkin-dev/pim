import { TimelinePanel } from '@/components/timeline-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import {
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
    Paper,
    Select,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { ChangeEvent, FormEventHandler, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriBodyCellSx, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriTableHeadCellSx, fioriTableHeadSx } from '@/lib/fiori-style';

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
    enabled: boolean;
    avatar: File | null;
    groups: number[];
    roles: number[];
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

export default function UserEdit({ user, groups, roles, localeOptions, timezones, departments, jobPositions, canManageAccess, permissions }: EditUserProps) {
    const { t } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('users'), href: '/system/user' },
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
        enabled: user.enabled,
        avatar: null,
        groups: user.group_ids,
        roles: user.role_ids,
        password: '',
        password_confirmation: '',
        ui_locale_id: user.ui_locale_id ?? '',
        timezone: user.timezone,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const update = (key: keyof UserForm, value: UserForm[keyof UserForm]) => {
        setData(key, value);
        clearErrors(key as string);
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

    const cancel = () => router.visit('/system/user');

    const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            update('avatar', file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            actions={
                <>
                    <Button
                        type="button"
                        onClick={cancel}
                        variant="contained"
                        color="inherit"
                        sx={{ ...fioriDefaultSx, px: 4 }}
                    >
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
                </>
            }
        >
            <Head title={t('editUserTitle', { name: user.name })} />
            <Box component="form" id="user-edit-form" onSubmit={submit} sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
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
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('userGroups')}
                            </Typography>
                            <Autocomplete
                                multiple
                                size="small"
                                options={groups}
                                getOptionLabel={(option) => option.name}
                                value={groups.filter((g) => data.groups.includes(g.id))}
                                onChange={(_, value) => update('groups', value.map((v) => v.id))}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => <Chip label={option.name} {...getTagProps({ index })} key={option.id} />)
                                }
                                renderInput={(params) => <TextField {...params} error={Boolean(errors.groups)} helperText={errors.groups} />}
                            />
                        </Box>

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                {t('rolesRequired')}
                            </Typography>
                            <Autocomplete
                                multiple
                                size="small"
                                options={roles}
                                getOptionLabel={(option) => option.label}
                                value={roles.filter((r) => data.roles.includes(r.id))}
                                onChange={(_, value) => update('roles', value.map((v) => v.id))}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => <Chip label={option.label} {...getTagProps({ index })} key={option.id} />)
                                }
                                renderInput={(params) => <TextField {...params} error={Boolean(errors.roles)} helperText={errors.roles} />}
                            />
                        </Box>
                    </Box>
                )}

                {tab === 'permissions' && (
                    <Box sx={{ maxWidth: 800 }}>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mb: 2 }}>
                            {t('permissionsDescription')}
                        </Typography>
                        <TableContainer component={Paper} sx={fioriCardSx}>
                            <Table size="small">
                                <TableHead sx={fioriTableHeadSx}>
                                    <TableRow>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('resource')}</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('action')}</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('grantedVia')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {permissionRows.map((row) => (
                                        <TableRow key={`${row.resource}.${row.action}`}>
                                            <TableCell sx={fioriBodyCellSx}>{humanize(row.resource)}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{humanize(row.action)}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>
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
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {permissionRows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ py: 4, color: FIORI.textSecondary }}>
                                                {t('noPermissionsAssigned')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
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
        </AppLayout>
    );
}
