import { UserMenuContent } from '@/components/user-menu-content';
import { useInitials } from '@/hooks/use-initials';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Avatar, Badge, Box, ButtonBase, Menu } from '@mui/material';
import { useState } from 'react';

export function NavUser() {
    const { auth } = usePage<SharedData>().props;
    
    if (!auth.user) return null;
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const getInitials = useInitials();

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    return (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ButtonBase
                onClick={handleOpen}
                sx={{
                    borderRadius: '50%',
                    p: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
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
                    <Avatar 
                        src={auth.user.avatar_url} 
                        alt={auth.user.name} 
                        sx={{ width: 32, height: 32, fontSize: 14 }}
                    >
                        {getInitials(auth.user.name)}
                    </Avatar>
                </Badge>
            </ButtonBase>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
            >
                <UserMenuContent user={auth.user} onClose={handleClose} />
            </Menu>
        </Box>
    );
}
