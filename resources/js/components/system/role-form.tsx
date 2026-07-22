import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    Box,
    Button,
    Checkbox,
    Divider,
    FormControlLabel,
    IconButton,
    Paper,
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
import { FormEventHandler, useState, useMemo } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'ROLES',
        href: '/system/roles',
    },
];

interface PermissionChild {
    label: string;
}

interface PermissionAction {
    label: string;
    children?: Record<string, PermissionChild>;
}

interface PermissionResource {
    label: string;
    actions: Record<string, PermissionAction>;
}

interface PermissionModule {
    label: string;
    resources: Record<string, PermissionResource>;
}

interface RoleUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface RoleFormProps {
    catalog: Record<string, PermissionModule>;
    users: RoleUserOption[];
    role?: {
        id: number;
        label: string;
        permissions: Record<string, string[]>;
        user_ids: number[];
    };
}

interface RoleForm {
    label: string;
    permissions: Record<string, string[]>;
    users: number[];
    [key: string]: string | number[] | Record<string, string[]>;
}

const TABS = ['General', 'Permissions', 'Users'];

export default function RoleFormPage({ catalog, users, role }: RoleFormProps) {
    const isEdit = Boolean(role);
    const [tab, setTab] = useState(0);

    const allResources = useMemo(() => {
        const res: Record<string, PermissionResource> = {};
        Object.values(catalog).forEach((module) => {
            Object.entries(module.resources || {}).forEach(([key, val]) => {
                res[key] = val;
            });
        });
        return res;
    }, [catalog]);

    const resourceKeys = Object.keys(allResources);
    const [activeResource, setActiveResource] = useState<string>(resourceKeys[0] ?? '');
    const [expandedActions, setExpandedActions] = useState<Record<string, boolean>>({});
    
    // Default all modules to expanded
    const initialExpandedModules = Object.keys(catalog).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(initialExpandedModules);

    const { data, setData, post, put, processing, errors, clearErrors } = useForm<RoleForm>({
        label: role?.label ?? '',
        permissions: role?.permissions ?? {},
        users: role?.user_ids ?? [],
    });

    const cancel = () => router.visit('/system/roles');

    const submit: FormEventHandler = (e) => {
        e.preventDefault();
        if (isEdit && role) {
            put(`/system/roles/${role.id}`);
        } else {
            post('/system/roles');
        }
    };

    const allActionKeys = (resourceKey: string): string[] => {
        const resource = allResources[resourceKey];
        if (!resource) return [];
        const keys: string[] = [];
        Object.entries(resource.actions).forEach(([actionKey, action]) => {
            keys.push(actionKey);
            if (action.children) {
                Object.keys(action.children).forEach((childKey) => keys.push(`${actionKey}.${childKey}`));
            }
        });
        return keys;
    };

    const isResourceFullyGranted = (resourceKey: string): boolean => {
        const all = allActionKeys(resourceKey);
        const granted = data.permissions[resourceKey] || [];
        return all.length > 0 && all.every((key) => granted.includes(key));
    };

    const isResourcePartiallyGranted = (resourceKey: string): boolean => {
        const granted = data.permissions[resourceKey] || [];
        return granted.length > 0 && !isResourceFullyGranted(resourceKey);
    };

    const isModuleFullyGranted = (moduleKey: string): boolean => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return false;
        return Object.keys(module.resources).every((resourceKey) => isResourceFullyGranted(resourceKey));
    };

    const isModulePartiallyGranted = (moduleKey: string): boolean => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return false;
        
        let hasAnyGranted = false;
        let isFullyGranted = true;

        Object.keys(module.resources).forEach((resourceKey) => {
            if (data.permissions[resourceKey] && data.permissions[resourceKey].length > 0) {
                hasAnyGranted = true;
            }
            if (!isResourceFullyGranted(resourceKey)) {
                isFullyGranted = false;
            }
        });

        return hasAnyGranted && !isFullyGranted;
    };

    const toggleResourceAll = (resourceKey: string) => {
        if (isResourceFullyGranted(resourceKey)) {
            setData('permissions', { ...data.permissions, [resourceKey]: [] });
        } else {
            setData('permissions', { ...data.permissions, [resourceKey]: allActionKeys(resourceKey) });
        }
    };

    const toggleModuleAll = (moduleKey: string) => {
        const module = catalog[moduleKey];
        if (!module || !module.resources) return;

        const newPermissions = { ...data.permissions };
        const fullyGranted = isModuleFullyGranted(moduleKey);

        Object.keys(module.resources).forEach((resourceKey) => {
            newPermissions[resourceKey] = fullyGranted ? [] : allActionKeys(resourceKey);
        });

        setData('permissions', newPermissions);
    };

    const toggleAction = (resourceKey: string, actionKey: string, children?: Record<string, PermissionChild>) => {
        const current = new Set(data.permissions[resourceKey] || []);
        const willGrant = !current.has(actionKey);

        if (willGrant) {
            current.add(actionKey);
            if (children) Object.keys(children).forEach((childKey) => current.add(`${actionKey}.${childKey}`));
        } else {
            current.delete(actionKey);
            if (children) Object.keys(children).forEach((childKey) => current.delete(`${actionKey}.${childKey}`));
        }

        setData('permissions', { ...data.permissions, [resourceKey]: Array.from(current) });
    };

    const toggleChild = (resourceKey: string, actionKey: string, childKey: string, siblingKeys: string[]) => {
        const key = `${actionKey}.${childKey}`;
        const current = new Set(data.permissions[resourceKey] || []);

        if (current.has(key)) {
            current.delete(key);
            current.delete(actionKey);
        } else {
            current.add(key);
            const allSiblingsChecked = siblingKeys.every((sibling) => sibling === childKey || current.has(`${actionKey}.${sibling}`));
            if (allSiblingsChecked) current.add(actionKey);
        }

        setData('permissions', { ...data.permissions, [resourceKey]: Array.from(current) });
    };

    const isChecked = (resourceKey: string, key: string): boolean => (data.permissions[resourceKey] || []).includes(key);

    const isParentIndeterminate = (resourceKey: string, actionKey: string, children?: Record<string, PermissionChild>): boolean => {
        if (!children) return false;
        const childKeys = Object.keys(children);
        const checkedCount = childKeys.filter((childKey) => isChecked(resourceKey, `${actionKey}.${childKey}`)).length;
        return checkedCount > 0 && checkedCount < childKeys.length;
    };

    const toggleUser = (userId: number) => {
        setData('users', data.users.includes(userId) ? data.users.filter((id) => id !== userId) : [...data.users, userId]);
    };

    const activeCatalog = allResources[activeResource];

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
                        form="role-form"
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
            <Head title={isEdit ? `Edit ${role?.label}` : 'Create Role'} />
            <Box component="form" id="role-form" onSubmit={submit} sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
                    {isEdit ? 'UPDATE' : 'CREATE'}
                </Typography>

                <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                    {TABS.map((label, index) => (
                        <Tab key={label} label={label} value={index} />
                    ))}
                </Tabs>

                {tab === 0 && (
                    <Box sx={{ maxWidth: 420 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                            Role Name *
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            value={data.label}
                            onChange={(e) => {
                                setData('label', e.target.value);
                                clearErrors('label');
                            }}
                            error={Boolean(errors.label)}
                            helperText={errors.label}
                        />
                    </Box>
                )}

                {tab === 1 && (
                    <Box sx={{ display: 'flex', gap: 4 }}>
                        <Box sx={{ minWidth: 200 }}>
                            {Object.entries(catalog).map(([moduleKey, module]) => {
                                const isExpanded = expandedModules[moduleKey] ?? true;
                                return (
                                    <Box key={moduleKey} sx={{ mb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                            <IconButton
                                                size="small"
                                                onClick={() => setExpandedModules({ ...expandedModules, [moduleKey]: !isExpanded })}
                                                sx={{ p: 0 }}
                                            >
                                                {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                            </IconButton>
                                            <Checkbox
                                                size="small"
                                                checked={isModuleFullyGranted(moduleKey)}
                                                indeterminate={isModulePartiallyGranted(moduleKey)}
                                                onChange={() => toggleModuleAll(moduleKey)}
                                                sx={{ p: 0.5, mr: 0.5 }}
                                            />
                                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', cursor: 'pointer' }} onClick={() => setExpandedModules({ ...expandedModules, [moduleKey]: !isExpanded })}>
                                                {module.label}
                                            </Typography>
                                        </Box>
                                        {isExpanded && (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1, pl: 4 }}>
                                                {Object.entries(module.resources || {}).map(([resourceKey, resource]) => (
                                                    <Box
                                                        key={resourceKey}
                                                        onClick={() => setActiveResource(resourceKey)}
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 1,
                                                            py: 0.1,
                                                            cursor: 'pointer',
                                                            color: activeResource === resourceKey ? 'primary.main' : 'text.primary',
                                                            fontWeight: activeResource === resourceKey ? 700 : 400,
                                                        }}
                                                    >
                                                        <Checkbox
                                                            size="small"
                                                            checked={isResourceFullyGranted(resourceKey)}
                                                            indeterminate={isResourcePartiallyGranted(resourceKey)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={() => toggleResourceAll(resourceKey)}
                                                        />
                                                        <Typography variant="body2" sx={{ fontWeight: 'inherit', color: 'inherit' }}>
                                                            {resource.label}
                                                        </Typography>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        {activeCatalog && (
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
                                    {activeCatalog.label}
                                </Typography>
                                <Divider sx={{ mb: 1 }} />
                                {Object.entries(activeCatalog.actions).map(([actionKey, action]) => {
                                    const hasChildren = Boolean(action.children);
                                    const expanded = expandedActions[actionKey] ?? true;

                                    return (
                                        <Box key={actionKey}>
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={isChecked(activeResource, actionKey)}
                                                            indeterminate={isParentIndeterminate(activeResource, actionKey, action.children)}
                                                            onChange={() => toggleAction(activeResource, actionKey, action.children)}
                                                        />
                                                    }
                                                    label={action.label}
                                                />
                                                {hasChildren && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setExpandedActions({ ...expandedActions, [actionKey]: !expanded })}
                                                    >
                                                        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                                    </IconButton>
                                                )}
                                            </Box>
                                            {hasChildren && expanded && (
                                                <Box sx={{ pl: 4, borderLeft: '1px solid', borderColor: 'divider', ml: 2 }}>
                                                    {Object.entries(action.children!).map(([childKey, child]) => (
                                                        <FormControlLabel
                                                            key={childKey}
                                                            control={
                                                                <Checkbox
                                                                    checked={isChecked(activeResource, `${actionKey}.${childKey}`)}
                                                                    onChange={() =>
                                                                        toggleChild(activeResource, actionKey, childKey, Object.keys(action.children!))
                                                                    }
                                                                />
                                                            }
                                                            label={child.label}
                                                            sx={{ display: 'flex' }}
                                                        />
                                                    ))}
                                                </Box>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Box>
                        )}
                    </Box>
                )}

                {tab === 2 && (
                    <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 1 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Has Role</TableCell>
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
                )}
            </Box>
        </AppLayout>
    );
}
