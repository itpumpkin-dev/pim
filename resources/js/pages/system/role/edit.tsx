import RoleFormPage from '@/components/system/role-form';

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

interface EditRoleProps {
    catalog: Record<string, PermissionModule>;
    users: RoleUserOption[];
    role: {
        id: number;
        label: string;
        permissions: Record<string, string[]>;
        user_ids: number[];
    };
}

export default function RoleEdit({ catalog, users, role }: EditRoleProps) {
    return <RoleFormPage catalog={catalog} users={users} role={role} />;
}
