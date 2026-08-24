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
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { FormEventHandler } from 'react';
import { FIORI, fioriBodyCellSx, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriTableHeadCellSx, fioriTableHeadSx, fioriTableRowSx } from '@/lib/fiori-style';

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
    users: UserGroupUserOption[];
    roles: RoleOption[];
    group?: {
        id: number;
        name: string;
        description: string | null;
        user_ids: number[];
        role_ids: number[];
    };
}

interface UserGroupForm {
    name: string;
    description: string;
    users: number[];
    roles: number[];
    [key: string]: string | number[];
}

export default function UserGroupFormPage({ users, roles, group }: UserGroupFormProps) {
    const isEdit = Boolean(group);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<UserGroupForm>({
        name: group?.name ?? '',
        description: group?.description ?? '',
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

    const toggleUser = (userId: number) => {
        setData('users', data.users.includes(userId) ? data.users.filter((id) => id !== userId) : [...data.users, userId]);
    };

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            actions={
                <>
                    <Button variant="contained" color="inherit" onClick={cancel} sx={{ ...fioriDefaultSx, px: 3 }}>
                        CANCEL
                    </Button>
                    <Button
                        type="submit"
                        form="user-group-form"
                        variant="contained"
                        disabled={processing}
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ ...fioriEmphasizedSx, px: 3 }}
                    >
                        {processing ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <Head title={isEdit ? `Edit ${group?.name}` : 'Create Group'} />
            <Box component="form" id="user-group-form" onSubmit={submit} sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 3 }}>
                    {isEdit ? group?.name : 'New Group'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 320 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                            Users
                        </Typography>
                        <Divider sx={{ mb: 2, borderColor: FIORI.border }} />
                        <TableContainer component={Paper} sx={fioriCardSx}>
                            <Table size="small">
                                <TableHead sx={fioriTableHeadSx}>
                                    <TableRow>
                                        <TableCell sx={fioriTableHeadCellSx}>Has Group</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>Employee ID</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>Username</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>E-mail</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>First name</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>Last name</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} sx={fioriTableRowSx(data.users.includes(user.id))}>
                                            <TableCell sx={fioriBodyCellSx}>
                                                <Checkbox checked={data.users.includes(user.id)} onChange={() => toggleUser(user.id)} />
                                            </TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{user.employee_id || '-'}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{user.username}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{user.email}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{user.first_name}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{user.last_name}</TableCell>
                                        </TableRow>
                                    ))}
                                    {users.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 3, color: FIORI.textSecondary }}>
                                                No users found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' }, borderColor: FIORI.border }} />

                    <Box sx={{ width: 320, flexShrink: 0 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                            General
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
        </AppLayout>
    );
}
