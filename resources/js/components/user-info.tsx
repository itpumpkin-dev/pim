import { useInitials } from '@/hooks/use-initials';
import { type User } from '@/types';
import { Avatar, Badge, Box, Typography } from '@mui/material';

export function UserInfo({ user, showEmail = false, withStatusDot = false }: { user: User; showEmail?: boolean; withStatusDot?: boolean }) {
    const getInitials = useInitials();

    const avatar = (
        <Avatar src={user.avatar_url} alt={user.name} sx={{ width: 32, height: 32, fontSize: 14 }}>
            {getInitials(user.name)}
        </Avatar>
    );

    return (
        <>
            {withStatusDot ? (
                <Badge
                    overlap="circular"
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    variant="dot"
                    sx={{
                        '& .MuiBadge-dot': {
                            bgcolor: '#22c55e',
                            border: '2px solid',
                            borderColor: 'background.paper',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                        },
                    }}
                >
                    {avatar}
                </Badge>
            ) : (
                avatar
            )}
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
