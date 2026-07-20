import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
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
                    <Button variant="contained" color="inherit" onClick={cancel} sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}>
                        CANCEL
                    </Button>
                    <Button
                        type="submit"
                        form="user-group-form"
                        variant="contained"
                        color="primary"
                        disabled={processing}
                        sx={{ borderRadius: 8, px: 3, fontWeight: 'bold', color: '#fff', }}
                    >
                        Save
                    </Button>
                </>
            }
        >
            <Head title={isEdit ? `Edit ${group?.name}` : 'Create Group'} />
            <Box component="form" id="user-group-form" onSubmit={submit} sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
                    {isEdit ? group?.name : 'New Group'}
                </Typography>

                <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 320 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                            Users
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Has Group</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Employee ID</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>E-mail</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>First name</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Last name</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <Checkbox checked={data.users.includes(user.id)} onChange={() => toggleUser(user.id)} />
                                            </TableCell>
                                            <TableCell>{user.employee_id || '-'}</TableCell>
                                            <TableCell>{user.username}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>{user.first_name}</TableCell>
                                            <TableCell>{user.last_name}</TableCell>
                                        </TableRow>
                                    ))}
                                    {users.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                                No users found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>

                    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />

                    <Box sx={{ width: 320, flexShrink: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                            General
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
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
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
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
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
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
