import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import ImageIcon from '@mui/icons-material/Image';
import { Autocomplete, Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Select, Tab, Tabs, TextField, Typography } from '@mui/material';
import { ChangeEvent, FormEventHandler, useRef, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'USERS',
        href: '/system/user',
    },
];

interface UserGroupOption {
    id: number;
    name: string;
}

interface RoleOption {
    id: number;
    label: string;
}

interface LocaleOption {
    id: number;
    code: string;
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
    locales: LocaleOption[];
    timezones: string[];
}

interface UserForm {
    name_prefix: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
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

const TABS = ['General properties', 'Groups and Roles', 'Password', 'Interfaces'];

function formatDateTime(value: string | null) {
    if (!value) return 'Never';
    return new Date(value).toLocaleString('en-US');
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

export default function UserEdit({ user, groups, roles, locales, timezones }: EditUserProps) {
    const [tab, setTab] = useState(0);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data, setData, post, processing, errors, clearErrors } = useForm<UserForm>({
        _method: 'put',
        name_prefix: user.name_prefix || '',
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone || '',
        email: user.email,
        enabled: user.enabled,
        avatar: null,
        groups: user.group_ids,
        roles: user.role_ids,
        password: '',
        password_confirmation: '',
        ui_locale_id: user.ui_locale_id ?? '',
        timezone: user.timezone,
    });

    const update = (key: keyof UserForm, value: UserForm[keyof UserForm]) => {
        setData(key, value);
        clearErrors(key as string);
    };

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        post(route('system.user.update', user.id), {
            forceFormData: true,
        });
    };

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
                <Button
                    type="submit"
                    form="user-edit-form"
                    variant="contained"
                    color="primary"
                    disabled={processing}
                    sx={{ borderRadius: 8, px: 4, fontWeight: 'bold' }}
                >
                    SAVE
                </Button>
            }
        >
            <Head title={`Edit ${user.name}`} />
            <Box component="form" id="user-edit-form" onSubmit={submit} sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Box
                        sx={{
                            width: 72,
                            height: 72,
                            borderRadius: 1,
                            border: '2px solid',
                            borderColor: 'text.primary',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        {avatarPreview ? (
                            <Box component="img" src={avatarPreview} alt={user.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <ImageIcon sx={{ fontSize: 36 }} />
                        )}
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                            {user.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Created: {formatDateTime(user.created_at)} Updated: {formatDateTime(user.updated_at)} Last logged in:{' '}
                            {formatDateTime(user.last_login_at)} Login count: {user.login_count}
                        </Typography>
                    </Box>
                </Box>

                <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                    {TABS.map((label, index) => (
                        <Tab key={label} label={label} value={index} />
                    ))}
                </Tabs>

                {tab === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Status *
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <FormControlLabel
                                    control={<Checkbox checked={data.enabled} onChange={() => update('enabled', true)} />}
                                    label="Active"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={!data.enabled} onChange={() => update('enabled', false)} />}
                                    label="Non Active"
                                />
                            </Box>
                        </Box>

                        {/* <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
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
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                First name (required)
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
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Last name (required)
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
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Phone
                            </Typography>
                            <TextField
                                fullWidth
                                size="small"
                                value={data.phone}
                                onChange={(e) => update('phone', e.target.value)}
                                error={Boolean(errors.phone)}
                                helperText={errors.phone}
                            />
                        </Box>

                        <Box
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                border: '2px dashed',
                                borderColor: 'divider',
                                borderRadius: 1,
                                p: 3,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 1,
                                cursor: 'pointer',
                            }}
                        >
                            <ImageIcon sx={{ fontSize: 32, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                                Drag and drop to upload or click here
                            </Typography>
                            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                        </Box>
                        {Boolean(errors.avatar) && (
                            <Typography variant="caption" color="error">
                                {errors.avatar}
                            </Typography>
                        )}

                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Email *
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

                {tab === 1 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 500 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                User groups
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
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Roles *
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

                {tab === 2 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                New password
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
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                New password (repeat)
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

                {tab === 3 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 420 }}>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                UI locale
                            </Typography>
                            <Select
                                fullWidth
                                size="small"
                                value={data.ui_locale_id}
                                onChange={(e) => update('ui_locale_id', Number(e.target.value))}
                                error={Boolean(errors.ui_locale_id)}
                            >
                                {locales.map((locale) => (
                                    <MenuItem key={locale.id} value={locale.id}>
                                        {localeLabel(locale.code)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Timezone (required)
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
