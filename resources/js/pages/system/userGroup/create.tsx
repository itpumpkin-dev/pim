import UserGroupFormPage from '@/components/system/user-group-form';

interface UserGroupUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface CreateUserGroupProps {
    users: UserGroupUserOption[];
}

export default function UserGroupCreate({ users }: CreateUserGroupProps) {
    return <UserGroupFormPage users={users} />;
}
