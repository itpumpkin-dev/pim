import UserGroupFormPage from '@/components/system/user-group-form';

interface UserGroupUserOption {
    id: number;
    employee_id: string | null;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
}

interface EditUserGroupProps {
    users: UserGroupUserOption[];
    group: {
        id: number;
        name: string;
        description: string | null;
        user_ids: number[];
    };
}

export default function UserGroupEdit({ users, group }: EditUserGroupProps) {
    return <UserGroupFormPage users={users} group={group} />;
}
