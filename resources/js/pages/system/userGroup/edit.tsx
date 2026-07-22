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
    users: UserGroupUserOption[];
    roles: RoleOption[];
    group: {
        id: number;
        name: string;
        description: string | null;
        user_ids: number[];
        role_ids: number[];
    };
}

export default function UserGroupEdit({ users, roles, group }: EditUserGroupProps) {
    return <UserGroupFormPage users={users} roles={roles} group={group} />;
}
