import UserGroupFormPage from '@/components/system/user-group-form';

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

interface EditUserGroupProps {
    canEditCode?: boolean;
    users: UserGroupUserOption[];
    roles: RoleOption[];
    group: {
        id: number;
        code: string;
        name: string;
        is_active: boolean;
        description: string | null;
        user_ids: number[];
        role_ids: number[];
    };
}

export default function UserGroupEdit({ users, roles, group, canEditCode = false }: EditUserGroupProps) {
    return <UserGroupFormPage users={users} roles={roles} group={group} canEditCode={canEditCode} />;
}
