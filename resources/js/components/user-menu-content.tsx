import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { type User } from '@/types';
import { Link, router } from '@inertiajs/react';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, CircularProgress, Divider, ListItemIcon, MenuItem } from '@mui/material';
import { useState } from 'react';

interface UserMenuContentProps {
    user: User;
    onClose?: () => void;
}

export function UserMenuContent({ user, onClose }: UserMenuContentProps) {
    const cleanup = useMobileNavigation();
    const [loggingOut, setLoggingOut] = useState(false);

    const handleClick = () => {
        cleanup();
        onClose?.();
    };

    const handleLogout = (e: React.MouseEvent) => {
        e.preventDefault();
        setLoggingOut(true);
        router.post(route('logout'), {}, {
            onFinish: () => {
                setLoggingOut(false);
                handleClick();
            }
        });
    };

    return (
        <>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
                <UserInfo user={user} showEmail />
            </Box>
            <Divider />
            <MenuItem component={Link} href={route('system.user.edit', user.id)} prefetch onClick={handleClick}>
                <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                </ListItemIcon>
                Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout} disabled={loggingOut}>
                <ListItemIcon>
                    {loggingOut ? <CircularProgress size={20} color="inherit" /> : <LogoutIcon fontSize="small" />}
                </ListItemIcon>
                {loggingOut ? 'Logging out...' : 'Log out'}
            </MenuItem>
        </>
    );
}
