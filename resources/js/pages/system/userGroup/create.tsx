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

interface CreateUserGroupProps {
    users: UserGroupUserOption[];
    roles: RoleOption[];
}

export default function UserGroupCreate({ users, roles }: CreateUserGroupProps) {
    return <UserGroupFormPage users={users} roles={roles} />;
}
