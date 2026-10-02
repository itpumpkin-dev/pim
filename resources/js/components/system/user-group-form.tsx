import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Divider,
    FormControlLabel,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { FormEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx, fioriTableRowSx } from '@/lib/fiori-style';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'USER GROUPS',
        href: '/system/userGroup',
    },
];

interface UserGroupUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface RoleOption {
    id: number;
    label: string;
}

interface UserGroupFormProps {
    /** Create only: prefilled into the Code field (next free group_N). */
    suggestedCode?: string;
    /** Edit only: whether the user holds user_groups.edit_code. */
    canEditCode?: boolean;
    users: UserGroupUserOption[];
    roles: RoleOption[];
    group?: {
        id: number;
        code: string;
        name: string;
        is_active: boolean;
        description: string | null;
        user_ids: number[];
        role_ids: number[];
    };
}

interface UserGroupForm {
    code: string;
    name: string;
    description: string;
    is_active: boolean;
    users: number[];
    roles: number[];
    [key: string]: string | boolean | number[];
}

export default function UserGroupFormPage({ suggestedCode, canEditCode = false, users, roles, group }: UserGroupFormProps) {
    const isEdit = Boolean(group);
    const { t: tCatalog } = useTranslation('catalog');
    // Anyone may pick the code on create; renaming it later needs user_groups.edit_code.
    const codeEditable = !isEdit || canEditCode;

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<UserGroupForm>({
        code: group?.code ?? suggestedCode ?? '',
        name: group?.name ?? '',
        description: group?.description ?? '',
        is_active: group?.is_active ?? true,
        users: group?.user_ids ?? [],
        roles: group?.role_ids ?? [],
    });

    const cancel = () => router.visit('/system/userGroup');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && group) {
            put(`/system/userGroup/${group.id}`);
        } else {
            post('/system/userGroup');
        }
    };

    // TODO(New Group): ส่วนเลือก Users (checkbox "Has Group") ยังไม่ต้องมีบนหน้านี้
    // — คอมเมนต์ไว้ก่อน ปลดคอมเมนต์ทั้ง toggleUser + userColumns + บล็อก <Box> "Users"
    // ในส่วน render เมื่อ flow พร้อม
    // const toggleUser = (userId: number) => {
    //     setData('users', data.users.includes(userId) ? data.users.filter((id) => id !== userId) : [...data.users, userId]);
    // };

    // Column pop-in priority (SAP Fiori responsive table): the "Has Group"
    // checkbox is the control being edited here, so it stays always visible
    // alongside Username (the natural identifier); the rest are descriptive
    // and reflow into the pop-in area first as space runs out.
    // const userColumns: FioriResponsiveColumn<UserGroupUserOption>[] = [
    //     {
    //         key: 'hasGroup',
    //         header: 'Has Group',
    //         priority: 'always',
    //         render: (user) => <Checkbox checked={data.users.includes(user.id)} onChange={() => toggleUser(user.id)} />,
    //     },
    //     {
    //         key: 'employeeId',
    //         header: 'Employee ID',
    //         priority: 'low',
    //         render: (user) => user.employee_id || '-',
    //     },
    //     {
    //         key: 'username',
    //         header: 'Username',
    //         priority: 'high',
    //         render: (user) => user.username,
    //     },
    //     {
    //         key: 'email',
    //         header: 'E-mail',
    //         priority: 'medium',
    //         render: (user) => user.email,
    //     },
    //     {
    //         key: 'firstName',
    //         header: 'First name',
    //         priority: 'medium',
    //         render: (user) => user.first_name,
    //     },
    //     {
    //         key: 'lastName',
    //         header: 'Last name',
    //         priority: 'low',
    //         render: (user) => user.last_name,
    //     },
    // ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isEdit ? `Edit ${group?.name}` : 'Create Group'} />
            <Box
                component="form"
                id="user-group-form"
                onSubmit={submit}
                sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', bgcolor: FIORI.pageBg }}
            >
                <Box sx={{ flex: 1, p: 4 }}>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 3 }}>
                    {isEdit ? group?.name : 'New Group'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* TODO(New Group): ส่วน Users (ตาราง + checkbox "Has Group") ยังไม่ต้องมี — ปลดคอมเมนต์เมื่อพร้อม
                    <Box sx={{ flex: 1, minWidth: 320 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                            Users
                        </Typography>
                        <Divider sx={{ mb: 2, borderColor: FIORI.border }} />
                        <FioriResponsiveTable
                            columns={userColumns}
                            rows={users}
                            getRowKey={(user) => user.id}
                            rowSx={(user) => fioriTableRowSx(data.users.includes(user.id))}
                            emptyMessage="No users found."
                        />
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' }, borderColor: FIORI.border }} />
                    */}

                    <Box sx={{ width: 320, flexShrink: 0 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                            General
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    User Group Code *
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={data.code}
                                    disabled={!codeEditable}
                                    placeholder="e.g. group_1"
                                    onChange={(e) => {
                                        setData('code', normalizeCodeInput(e.target.value));
                                        clearErrors('code');
                                    }}
                                    error={Boolean(errors.code)}
                                    helperText={errors.code ?? tCatalog(codeHintKey({ canEditCode: codeEditable }))}
                                />
                            </Box>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    Name *
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={data.name}
                                    onChange={(e) => {
                                        setData('name', e.target.value);
                                        clearErrors('name');
                                    }}
                                    error={Boolean(errors.name)}
                                    helperText={errors.name}
                                />
                            </Box>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    Description *
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    multiline
                                    minRows={3}
                                    placeholder="Description"
                                    value={data.description}
                                    onChange={(e) => {
                                        setData('description', e.target.value);
                                        clearErrors('description');
                                    }}
                                    error={Boolean(errors.description)}
                                    helperText={errors.description}
                                />
                            </Box>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    Status
                                </Typography>
                                <FormControlLabel
                                    control={<Switch checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                    label={data.is_active ? 'Active' : 'Inactive'}
                                />
                                {errors.is_active && (
                                    <Typography variant="caption" color="error" display="block">
                                        {errors.is_active}
                                    </Typography>
                                )}
                            </Box>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: FIORI.textPrimary, mb: 0.5 }}>
                                    Roles
                                </Typography>
                                <Autocomplete
                                    multiple
                                    size="small"
                                    options={roles}
                                    getOptionLabel={(option) => option.label}
                                    isOptionEqualToValue={(option, value) => option.id === value.id}
                                    value={roles.filter((r) => data.roles.includes(r.id))}
                                    onChange={(e, newValue) => setData('roles', newValue.map((v) => v.id))}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Select roles"
                                            error={Boolean(errors.roles)}
                                            helperText={errors.roles}
                                        />
                                    )}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
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
                    <Button variant="contained" color="inherit" onClick={cancel} sx={{ ...fioriDefaultSx, px: 3 }}>
                        CANCEL
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ ...fioriEmphasizedSx, px: 3 }}
                    >
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </Box>
            </Box>
        </AppLayout>
    );
}
