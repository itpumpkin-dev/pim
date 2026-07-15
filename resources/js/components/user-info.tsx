import { useInitials } from '@/hooks/use-initials';
import { type User } from '@/types';
import { Avatar, Box, Typography } from '@mui/material';

export function UserInfo({ user, showEmail = false }: { user: User; showEmail?: boolean }) {
    const getInitials = useInitials();

    return (
        <>
            <Avatar src={user.avatar} alt={user.name} sx={{ width: 32, height: 32, fontSize: 14 }}>
                {getInitials(user.name)}
            </Avatar>
            <Box sx={{ display: 'grid', flex: 1, textAlign: 'left', minWidth: 0, ml: 1.5 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                    {user.name}
                </Typography>
                {showEmail && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                        {user.email}
                    </Typography>
                )}
            </Box>
        </>
    );
}
