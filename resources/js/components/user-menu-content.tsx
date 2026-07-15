import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { type User } from '@/types';
import { Link } from '@inertiajs/react';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Divider, ListItemIcon, MenuItem } from '@mui/material';

interface UserMenuContentProps {
    user: User;
    onClose?: () => void;
}

export function UserMenuContent({ user, onClose }: UserMenuContentProps) {
    const cleanup = useMobileNavigation();

    const handleClick = () => {
        cleanup();
        onClose?.();
    };

    return (
        <>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
                <UserInfo user={user} showEmail />
            </Box>
            <Divider />
            <MenuItem component={Link} href={route('profile.edit')} prefetch onClick={handleClick}>
                <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                </ListItemIcon>
                Settings
            </MenuItem>
            <Divider />
            <MenuItem component={Link} method="post" href={route('logout')} onClick={handleClick}>
                <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Log out
            </MenuItem>
        </>
    );
}
