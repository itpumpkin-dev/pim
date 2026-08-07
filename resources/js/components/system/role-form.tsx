import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
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
    Tooltip,
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

interface AttributeGroup {
    id: number;
    code: string;
    name: string;
}

interface Attribute {
    id: number;
    code: string;
    name: string;
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
    attributeGroups: AttributeGroup[];
    attributes: Attribute[];
}

interface RoleForm {
    label: string;
    permissions: Record<string, string[]>;
    users: number[];
    [key: string]: string | number[] | Record<string, string[]>;
}

const TABS = ['General', 'Permissions', 'Users'];

export default function RoleFormPage({ catalog, users, role, attributeGroups, attributes }: RoleFormProps) {
    const isEdit = Boolean(role);
    const [tab, setTab] = useState(0);
    const [expandedAttrGroups, setExpandedAttrGroups] = useState(true);
    const [expandedAttributes, setExpandedAttributes] = useState(true);

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

    // Check if user has both products AND attributes permissions to show Attribute Access
    const hasProductsPermission = useMemo(
        () => {
            return (data.permissions['products'] || []).length > 0;
        },
        [data.permissions]
    );

    // Read/Edit access for the "Attribute Groups" / "Individual Attributes" tables below.
    // Edit always implies Read — checking Edit turns Read on too, and unchecking Read
    // turns Edit back off, so the two resources (view_*/edit_*) never end up inconsistent.
    const hasAccess = (resource: string, prefix: 'view' | 'edit', code: string) =>
        (data.permissions[resource] || []).includes(`${prefix}_${code}`);

    const setAccess = (viewResource: string, editResource: string, code: string, level: 'read' | 'edit', checked: boolean) => {
        const view = new Set(data.permissions[viewResource] || []);
        const edit = new Set(data.permissions[editResource] || []);

        if (level === 'read') {
            if (checked) {
                view.add(`view_${code}`);
            } else {
                view.delete(`view_${code}`);
                edit.delete(`edit_${code}`);
            }
        } else {
            if (checked) {
                edit.add(`edit_${code}`);
                view.add(`view_${code}`);
            } else {
                edit.delete(`edit_${code}`);
            }
        }

        setData('permissions', { ...data.permissions, [viewResource]: Array.from(view), [editResource]: Array.from(edit) });
    };

    const setAllAccess = (viewResource: string, editResource: string, codes: string[], level: 'read' | 'edit', checked: boolean) => {
        const view = new Set(data.permissions[viewResource] || []);
        const edit = new Set(data.permissions[editResource] || []);

        codes.forEach((code) => {
            if (level === 'read') {
                if (checked) {
                    view.add(`view_${code}`);
                } else {
                    view.delete(`view_${code}`);
                    edit.delete(`edit_${code}`);
                }
            } else {
                if (checked) {
                    edit.add(`edit_${code}`);
                    view.add(`view_${code}`);
                } else {
                    edit.delete(`edit_${code}`);
                }
            }
        });

        setData('permissions', { ...data.permissions, [viewResource]: Array.from(view), [editResource]: Array.from(edit) });
    };

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
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ borderRadius: 8, px: 3, fontWeight: 'bold', color: '#fff', }}
                    >
                        {processing ? 'Saving…' : 'Save'}
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
                    <>
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
                                                <Box sx={{
                                                    pl: 4,
                                                    borderLeft: '1px solid',
                                                    borderColor: 'divider',
                                                    ml: 2,
                                                    maxHeight: '400px',
                                                    overflowY: 'auto',
                                                    pr: 1,
                                                }}>
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

                    {/* Attribute Access Section - Only show if user has products permission */}
                    {hasProductsPermission ? (
                    <Box sx={{ mt: 4, pt: 3, mb: 10, pb: 5, borderTop: '2px solid', borderColor: 'divider', width: '100%' }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: 'primary.main' }}>
                            📋 Attribute Access
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Read lets this role see the field on a product; Edit lets it change the value (checking Edit turns Read on too).
                            An attribute's Edit is overridden by its Attribute Group's setting — if the group is Read-only, the attribute stays read-only on the product even when Edit is checked here.
                        </Typography>

                        {/* Attribute Groups */}
                        <Box sx={{ mb: 3 }}>
                            <Box
                                onClick={() => setExpandedAttrGroups(!expandedAttrGroups)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 2,
                                    cursor: 'pointer',
                                    p: 1,
                                    bgcolor: '#f5f5f5',
                                    borderRadius: 1,
                                }}
                            >
                                <IconButton size="small" sx={{ p: 0, mr: 1 }}>
                                    {expandedAttrGroups ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                    🏷️ Attribute Groups
                                </Typography>
                            </Box>

                            {expandedAttrGroups && (
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700 }}>Attribute Group</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={attributeGroups.length > 0 && attributeGroups.every((g) => hasAccess('view_attribute_groups', 'view', g.code))}
                                                        indeterminate={attributeGroups.some((g) => hasAccess('view_attribute_groups', 'view', g.code)) && !attributeGroups.every((g) => hasAccess('view_attribute_groups', 'view', g.code))}
                                                        onChange={(e) => setAllAccess('view_attribute_groups', 'edit_attribute_groups', attributeGroups.map((g) => g.code), 'read', e.target.checked)}
                                                    />
                                                    Read
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={attributeGroups.length > 0 && attributeGroups.every((g) => hasAccess('edit_attribute_groups', 'edit', g.code))}
                                                        indeterminate={attributeGroups.some((g) => hasAccess('edit_attribute_groups', 'edit', g.code)) && !attributeGroups.every((g) => hasAccess('edit_attribute_groups', 'edit', g.code))}
                                                        onChange={(e) => setAllAccess('view_attribute_groups', 'edit_attribute_groups', attributeGroups.map((g) => g.code), 'edit', e.target.checked)}
                                                    />
                                                    Edit
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {attributeGroups.map((group) => (
                                                <TableRow key={group.id}>
                                                    <TableCell>{group.name}</TableCell>
                                                    <TableCell align="center">
                                                        <Checkbox
                                                            size="small"
                                                            checked={hasAccess('view_attribute_groups', 'view', group.code)}
                                                            onChange={(e) => setAccess('view_attribute_groups', 'edit_attribute_groups', group.code, 'read', e.target.checked)}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Checkbox
                                                            size="small"
                                                            checked={hasAccess('edit_attribute_groups', 'edit', group.code)}
                                                            onChange={(e) => setAccess('view_attribute_groups', 'edit_attribute_groups', group.code, 'edit', e.target.checked)}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Box>

                        {/* Attributes */}
                        <Box>
                            <Box
                                onClick={() => setExpandedAttributes(!expandedAttributes)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    mb: 2,
                                    cursor: 'pointer',
                                    p: 1,
                                    bgcolor: '#f5f5f5',
                                    borderRadius: 1,
                                }}
                            >
                                <IconButton size="small" sx={{ p: 0, mr: 1 }}>
                                    {expandedAttributes ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                </IconButton>
                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                    ⚙️ Individual Attributes
                                </Typography>
                            </Box>

                            {expandedAttributes && (
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700 }}>Attribute</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={attributes.length > 0 && attributes.every((a) => hasAccess('view_attributes', 'view', a.code))}
                                                        indeterminate={attributes.some((a) => hasAccess('view_attributes', 'view', a.code)) && !attributes.every((a) => hasAccess('view_attributes', 'view', a.code))}
                                                        onChange={(e) => setAllAccess('view_attributes', 'edit_attributes', attributes.map((a) => a.code), 'read', e.target.checked)}
                                                    />
                                                    Read
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, width: 100 }}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={attributes.length > 0 && attributes.every((a) => hasAccess('edit_attributes', 'edit', a.code))}
                                                        indeterminate={attributes.some((a) => hasAccess('edit_attributes', 'edit', a.code)) && !attributes.every((a) => hasAccess('edit_attributes', 'edit', a.code))}
                                                        onChange={(e) => setAllAccess('view_attributes', 'edit_attributes', attributes.map((a) => a.code), 'edit', e.target.checked)}
                                                    />
                                                    Edit
                                                    <Tooltip title="A Read-only Attribute Group overrides this — an attribute stays read-only on the product if its group isn't editable, even when checked here.">
                                                        <InfoOutlinedIcon fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {attributes.map((attr: Attribute) => (
                                                <TableRow key={attr.id}>
                                                    <TableCell>{attr.name}</TableCell>
                                                    <TableCell align="center">
                                                        <Checkbox
                                                            size="small"
                                                            checked={hasAccess('view_attributes', 'view', attr.code)}
                                                            onChange={(e) => setAccess('view_attributes', 'edit_attributes', attr.code, 'read', e.target.checked)}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Checkbox
                                                            size="small"
                                                            checked={hasAccess('edit_attributes', 'edit', attr.code)}
                                                            onChange={(e) => setAccess('view_attributes', 'edit_attributes', attr.code, 'edit', e.target.checked)}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Box>
                    </Box>
                    ) : (
                        <Box sx={{ mt: 2, pt: 3, p: 2, bgcolor: '#fff3cd', border: '1px solid #ffecb5', borderRadius: 1 }}>
                            <Typography variant="body2" sx={{ color: '#856404' }}>
                                ⚠️ กำหนดสิทธิ์ "Products" ก่อนจึงจะสามารถกำหนดสิทธิ์ Attribute Access ได้
                            </Typography>
                        </Box>
                    )}
                    </>
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
