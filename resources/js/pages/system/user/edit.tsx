import { FioriField, FioriFormErrorSummary, FioriFormGroup, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { TimelinePanel } from '@/components/timeline-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/picture.js';
import '@ui5/webcomponents-icons/dist/show.js';
import {
    Bar,
    Button,
    Dialog,
    Icon,
    Input,
    MultiComboBox,
    MultiComboBoxItem,
    Option,
    RadioButton,
    Select,
    Tab,
    TabContainer,
    Tag,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { ChangeEvent, FormEventHandler, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    canEditPassword: boolean;
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

/** Select value ('' = none) → form value (number | '') */
const toIdOrEmpty = (value: string | undefined): number | '' => (value ? Number(value) : '');

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
    canEditPassword,
    permissions,
}: EditUserProps) {
    const { t } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const { t: tCatalog } = useTranslation('catalog');

    // Anyone can open their own account here (it's the "Settings" page from the
    // user menu), but the user list at /system/user is gated by
    // `users.list_users`. Without it, sending them there — via the breadcrumb or
    // Cancel — lands on a 403 page, so fall back to the dashboard, which every
    // signed-in user can reach.
    const { auth } = usePage<SharedData>().props;
    const viewerPermissions = auth.permissions ?? [];
    const canListUsers = viewerPermissions.includes('users.list_users');
    const cancelHref = canListUsers ? '/system/user' : '/dashboard';

    // Fiori Message Box แทน window.confirm() ของเบราว์เซอร์ (ดู copyAccessToManager()
    // ด้านล่าง) — {confirmElement} ต้อง render ไว้ในต้นไม้ JSX ของหน้านี้ด้วย
    const { confirm, confirmElement } = useFioriConfirm();

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
    const tabs = TAB_KEYS.filter((key) => {
        if (key === 'groupsAndRoles') return canManageAccess;
        if (key === 'password') return canEditPassword;
        return true;
    });
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

        return Array.from(rows.values()).sort((a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action));
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
            render: (row: PermissionRow) => humanize(row.resource),
        },
        {
            key: 'action',
            header: t('action'),
            priority: 'high',
            render: (row: PermissionRow) => humanize(row.action),
        },
        {
            key: 'grantedVia',
            header: t('grantedVia'),
            priority: 'medium',
            render: (row: PermissionRow) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {row.sources.map((source) => (
                        <Tag key={source} design="Neutral" hideStateIcon>
                            {source}
                        </Tag>
                    ))}
                </div>
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

    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // "Give the manager these too": mirror this user's groups + directly-
    // assigned roles onto the selected manager right away (separate PUT).
    // preserveState keeps the form as-is; the refreshed managerPermissionsById
    // prop makes the warning recompute.
    const copyAccessToManager = async () => {
        if (data.manager_id === '') return;
        const managerName = managerOptions.find((o) => o.id === data.manager_id)?.name ?? '';
        const confirmed = await confirm({
            title: t('copyRolesToManager'),
            message: t('copyRolesToManagerConfirm', { name: managerName }),
            severity: 'warning',
        });
        if (!confirmed) return;

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

    const passwordToggle = (visible: boolean, toggle: () => void) => (
        <Icon
            name={visible ? 'hide' : 'show'}
            mode="Interactive"
            accessibleName={visible ? t('hidePassword') : t('showPassword')}
            showTooltip
            onClick={toggle}
        />
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('editUserTitle', { name: user.name })} />
            <form
                id="user-edit-form"
                onSubmit={submit}
                style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--sapBackgroundColor)' }}
            >
                <div style={{ flex: 1, padding: '2rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div
                            onClick={() => avatarPreview && setAvatarViewerOpen(true)}
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: '8px',
                                border: '2px solid var(--sapGroup_ContentBorderColor)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                flexShrink: 0,
                                cursor: avatarPreview ? 'pointer' : 'default',
                            }}
                        >
                            {avatarPreview ? (
                                <img src={avatarPreview} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <Icon name="picture" style={{ width: 36, height: 36, color: 'var(--sapContent_LabelColor)' }} />
                            )}
                        </div>

                        <Dialog
                            open={avatarViewerOpen}
                            onClose={() => setAvatarViewerOpen(false)}
                            header={
                                <Bar
                                    endContent={
                                        <Button
                                            design="Transparent"
                                            icon="decline"
                                            tooltip={tCatalog('close')}
                                            accessibleName={tCatalog('close')}
                                            onClick={() => setAvatarViewerOpen(false)}
                                        />
                                    }
                                >
                                    <Title level="H5">{user.name}</Title>
                                </Bar>
                            }
                            style={{ maxWidth: 600 }}
                        >
                            {avatarPreview && (
                                <img
                                    src={avatarPreview}
                                    alt={user.name}
                                    style={{ display: 'block', width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                                />
                            )}
                        </Dialog>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                            <Title level="H2" size="H3" wrappingType="Normal">
                                {user.name}
                            </Title>
                            <Text style={{ color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' }}>
                                {t('createdLabel')}: {formatDateTime(user.created_at)} {t('updatedLabel')}: {formatDateTime(user.updated_at)}{' '}
                                {t('lastLoggedInLabel')}: {formatDateTime(user.last_login_at)} {t('loginCountLabel')}: {user.login_count}
                            </Text>
                        </div>
                    </div>

                    <TabContainer
                        collapsed
                        contentBackgroundDesign="Transparent"
                        onTabSelect={(e) => {
                            const key = tabs[e.detail.tabIndex];
                            if (key) setTab(key);
                        }}
                        style={{ marginBottom: '1.5rem' }}
                    >
                        {tabs.map((key) => (
                            <Tab key={key} text={tabLabels[key]} selected={tab === key} />
                        ))}
                    </TabContainer>

                    {tab === 'general' && (
                        <FioriFormGroup title={t('tabGeneralProperties')} style={{ maxWidth: 760 }}>
                            {canManageAccess && (
                                <FioriField label={t('fieldStatus')} required>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <RadioButton
                                            name="user-status"
                                            text={t('active')}
                                            checked={data.enabled}
                                            onChange={() => update('enabled', true)}
                                        />
                                        <RadioButton
                                            name="user-status"
                                            text={t('nonActive')}
                                            checked={!data.enabled}
                                            onChange={() => update('enabled', false)}
                                        />
                                    </div>
                                </FioriField>
                            )}

                            <FioriField
                                label={t('fieldFirstName')}
                                htmlFor="user-first-name"
                                required
                                valueState={valueStateOf(errors.first_name)}
                                message={errors.first_name}
                            >
                                <Input
                                    id="user-first-name"
                                    value={data.first_name}
                                    valueState={ui5ValueState(valueStateOf(errors.first_name))}
                                    onInput={(e) => update('first_name', e.target.value)}
                                />
                            </FioriField>

                            <FioriField
                                label={t('fieldLastName')}
                                htmlFor="user-last-name"
                                required
                                valueState={valueStateOf(errors.last_name)}
                                message={errors.last_name}
                            >
                                <Input
                                    id="user-last-name"
                                    value={data.last_name}
                                    valueState={ui5ValueState(valueStateOf(errors.last_name))}
                                    onInput={(e) => update('last_name', e.target.value)}
                                />
                            </FioriField>

                            <FioriField label={t('phone')} htmlFor="user-phone" valueState={valueStateOf(errors.phone)} message={errors.phone}>
                                <Input
                                    id="user-phone"
                                    value={data.phone}
                                    maxlength={10}
                                    valueState={ui5ValueState(valueStateOf(errors.phone))}
                                    onInput={(e) => update('phone', e.target.value.slice(0, 10))}
                                />
                            </FioriField>

                            <FioriField
                                label={t('department')}
                                htmlFor="user-department"
                                valueState={valueStateOf(errors.department_id)}
                                message={errors.department_id}
                            >
                                <Select
                                    id="user-department"
                                    value={String(data.department_id)}
                                    valueState={ui5ValueState(valueStateOf(errors.department_id))}
                                    onChange={(e) => update('department_id', toIdOrEmpty(e.detail.selectedOption.value))}
                                >
                                    <Option value="">—</Option>
                                    {departments.map((department) => (
                                        <Option key={department.id} value={String(department.id)}>
                                            {department.name}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>

                            <FioriField
                                label={t('jobPosition')}
                                htmlFor="user-job-position"
                                valueState={valueStateOf(errors.job_position_id)}
                                message={errors.job_position_id}
                            >
                                <Select
                                    id="user-job-position"
                                    value={String(data.job_position_id)}
                                    valueState={ui5ValueState(valueStateOf(errors.job_position_id))}
                                    onChange={(e) => update('job_position_id', toIdOrEmpty(e.detail.selectedOption.value))}
                                >
                                    <Option value="">—</Option>
                                    {jobPositions.map((jobPosition) => (
                                        <Option key={jobPosition.id} value={String(jobPosition.id)}>
                                            {jobPosition.name}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>

                            {canManageAccess && (
                                <FioriField
                                    label={t('reportsTo')}
                                    htmlFor="user-manager"
                                    valueState={valueStateOf(errors.manager_id)}
                                    message={errors.manager_id}
                                >
                                    <Select
                                        id="user-manager"
                                        value={String(data.manager_id)}
                                        valueState={ui5ValueState(valueStateOf(errors.manager_id))}
                                        onChange={(e) => update('manager_id', toIdOrEmpty(e.detail.selectedOption.value))}
                                    >
                                        <Option value="">—</Option>
                                        {managerOptions.map((option) => (
                                            <Option key={option.id} value={String(option.id)}>
                                                {option.name}
                                            </Option>
                                        ))}
                                    </Select>
                                    {managerExcessPermissions.length > 0 && (
                                        <FioriMessageStrip severity="warning" style={{ marginTop: '0.5rem' }}>
                                            {t('managerExcessPermissionsWarning', { count: managerExcessPermissions.length })}
                                            <ul style={{ margin: '4px 0 0', paddingLeft: '1.25rem' }}>
                                                {managerExcessPermissions.slice(0, 8).map((p) => (
                                                    <li key={p}>{p}</li>
                                                ))}
                                                {managerExcessPermissions.length > 8 && (
                                                    <li>{t('andNMore', { count: managerExcessPermissions.length - 8 })}</li>
                                                )}
                                            </ul>
                                            <Button
                                                design="Attention"
                                                disabled={copyingAccess}
                                                loading={copyingAccess}
                                                onClick={copyAccessToManager}
                                                style={{ marginTop: '0.5rem' }}
                                            >
                                                {t('copyRolesToManager')}
                                            </Button>
                                        </FioriMessageStrip>
                                    )}
                                </FioriField>
                            )}

                            <FioriField label={t('avatar')} fullWidth valueState={valueStateOf(errors.avatar)} message={errors.avatar}>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed var(--sapGroup_ContentBorderColor)',
                                        borderRadius: '8px',
                                        padding: '1.5rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Icon name="picture" style={{ width: 32, height: 32, color: 'var(--sapContent_LabelColor)' }} />
                                    <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('dragDropUpload')}</Text>
                                    <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                                </div>
                            </FioriField>

                            <FioriField
                                label={t('fieldEmail')}
                                htmlFor="user-email"
                                required
                                valueState={valueStateOf(errors.email)}
                                message={errors.email}
                            >
                                <Input
                                    id="user-email"
                                    type="Email"
                                    value={data.email}
                                    valueState={ui5ValueState(valueStateOf(errors.email))}
                                    onInput={(e) => update('email', e.target.value)}
                                />
                            </FioriField>
                        </FioriFormGroup>
                    )}

                    {tab === 'groupsAndRoles' && canManageAccess && (
                        <FioriFormGroup title={t('tabGroupsAndRoles')} description={t('groupsOrRolesHint')} style={{ maxWidth: 760 }}>
                            <FioriField
                                label={t('userGroups')}
                                htmlFor="user-groups"
                                valueState={valueStateOf(accessForm.errors.groups)}
                                message={accessForm.errors.groups}
                            >
                                <MultiComboBox
                                    id="user-groups"
                                    placeholder={t('userGroups')}
                                    selectedValues={accessForm.data.groups.map(String)}
                                    valueState={ui5ValueState(valueStateOf(accessForm.errors.groups))}
                                    onSelectionChange={(e) => {
                                        accessForm.setData(
                                            'groups',
                                            e.detail.items.map((item) => Number(item.value)).filter((id) => !Number.isNaN(id)),
                                        );
                                        accessForm.clearErrors('groups');
                                    }}
                                >
                                    {groups.map((group) => (
                                        <MultiComboBoxItem key={group.id} value={String(group.id)} text={group.name} />
                                    ))}
                                </MultiComboBox>
                            </FioriField>

                            <FioriField
                                label={t('roles')}
                                htmlFor="user-roles"
                                valueState={valueStateOf(accessForm.errors.roles)}
                                message={accessForm.errors.roles}
                            >
                                <MultiComboBox
                                    id="user-roles"
                                    placeholder={t('roles')}
                                    selectedValues={accessForm.data.roles.map(String)}
                                    valueState={ui5ValueState(valueStateOf(accessForm.errors.roles))}
                                    onSelectionChange={(e) => {
                                        accessForm.setData(
                                            'roles',
                                            e.detail.items.map((item) => Number(item.value)).filter((id) => !Number.isNaN(id)),
                                        );
                                        accessForm.clearErrors('roles');
                                    }}
                                >
                                    {roles.map((role) => (
                                        <MultiComboBoxItem key={role.id} value={String(role.id)} text={role.label} />
                                    ))}
                                </MultiComboBox>
                            </FioriField>

                            <FioriField label="">
                                <Button
                                    design="Emphasized"
                                    onClick={saveAccess}
                                    disabled={accessForm.processing || !accessForm.isDirty}
                                    loading={accessForm.processing}
                                    style={{ minWidth: '8rem' }}
                                >
                                    {accessForm.processing ? t('saving').toUpperCase() : t('saveGroupsAndRoles').toUpperCase()}
                                </Button>
                            </FioriField>
                        </FioriFormGroup>
                    )}

                    {tab === 'permissions' && (
                        <div style={{ maxWidth: 800 }}>
                            <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', marginBottom: '1rem' }}>
                                {t('permissionsDescription')}
                            </Text>
                            <FioriResponsiveTable
                                size="small"
                                columns={permissionColumns}
                                rows={permissionRows}
                                getRowKey={(row: PermissionRow) => `${row.resource}.${row.action}`}
                                emptyMessage={t('noPermissionsAssigned')}
                            />
                        </div>
                    )}

                    {tab === 'timeline' && (
                        <div style={{ maxWidth: 700 }}>
                            <TimelinePanel timelineUrl={route('system.user.history', user.id)} />
                        </div>
                    )}

                    {tab === 'password' && (
                        <FioriFormGroup title={t('tabPassword')} style={{ maxWidth: 760 }}>
                            <FioriField
                                label={t('newPassword')}
                                htmlFor="user-password"
                                valueState={valueStateOf(errors.password)}
                                message={errors.password}
                            >
                                <Input
                                    id="user-password"
                                    type={showPassword ? 'Text' : 'Password'}
                                    value={data.password}
                                    valueState={ui5ValueState(valueStateOf(errors.password))}
                                    onInput={(e) => update('password', e.target.value)}
                                    icon={passwordToggle(showPassword, () => setShowPassword((prev) => !prev))}
                                />
                            </FioriField>
                            <FioriField label={t('newPasswordRepeat')} htmlFor="user-password-confirm">
                                <Input
                                    id="user-password-confirm"
                                    type={showPasswordConfirm ? 'Text' : 'Password'}
                                    value={data.password_confirmation}
                                    onInput={(e) => update('password_confirmation', e.target.value)}
                                    icon={passwordToggle(showPasswordConfirm, () => setShowPasswordConfirm((prev) => !prev))}
                                />
                            </FioriField>
                        </FioriFormGroup>
                    )}

                    {tab === 'interfaces' && (
                        <FioriFormGroup title={t('tabInterfaces')} style={{ maxWidth: 760 }}>
                            <FioriField
                                label={t('uiLocale')}
                                htmlFor="user-ui-locale"
                                valueState={valueStateOf(errors.ui_locale_id)}
                                message={errors.ui_locale_id}
                            >
                                <Select
                                    id="user-ui-locale"
                                    value={String(data.ui_locale_id)}
                                    valueState={ui5ValueState(valueStateOf(errors.ui_locale_id))}
                                    onChange={(e) => update('ui_locale_id', Number(e.detail.selectedOption.value))}
                                >
                                    {/* MUI Select แสดงช่องว่างเมื่อยังไม่ได้ตั้งค่า — UI5 Select ต้องมี option ที่ตรง value */}
                                    {data.ui_locale_id === '' && <Option value="">—</Option>}
                                    {localeOptions.map((locale) => (
                                        <Option key={locale.id} value={String(locale.id)}>
                                            {localeLabel(locale.code)}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>
                            <FioriField
                                label={t('fieldTimezone')}
                                htmlFor="user-timezone"
                                required
                                valueState={valueStateOf(errors.timezone)}
                                message={errors.timezone}
                            >
                                <Select
                                    id="user-timezone"
                                    value={data.timezone}
                                    valueState={ui5ValueState(valueStateOf(errors.timezone))}
                                    onChange={(e) => update('timezone', e.detail.selectedOption.value ?? '')}
                                >
                                    {timezones.map((tz) => (
                                        <Option key={tz} value={tz}>
                                            {tz}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>
                        </FioriFormGroup>
                    )}

                    <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} style={{ marginTop: '1rem', maxWidth: 760 }} />
                </div>

                {/* Fiori footer action bar — ปุ่มอยู่ล่างสุด ติดขอบ ไม่ใช่บน header */}
                <div
                    style={{
                        position: 'sticky',
                        bottom: 0,
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.5rem',
                        padding: '1rem 2rem',
                        background: 'var(--sapGroup_ContentBackground)',
                        borderTop: '1px solid var(--sapGroup_ContentBorderColor)',
                    }}
                >
                    <Button onClick={cancel} style={{ minWidth: '6rem' }}>
                        {t('cancel').toUpperCase()}
                    </Button>
                    <Button design="Emphasized" onClick={performSubmit} disabled={processing} loading={processing} style={{ minWidth: '6rem' }}>
                        {processing ? t('saving').toUpperCase() : t('save').toUpperCase()}
                    </Button>
                </div>
            </form>
            {confirmElement}
        </AppLayout>
    );
}
