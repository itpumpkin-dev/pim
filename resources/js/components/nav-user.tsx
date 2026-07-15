import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';
import { useSidebar } from '@/hooks/use-sidebar';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import ExpandMoreIcon from '@mui/icons-material/UnfoldMore';
import { Box, ButtonBase, Menu } from '@mui/material';
import { useState } from 'react';

export function NavUser({ collapsed = false }: { collapsed?: boolean }) {
    const { auth } = usePage<SharedData>().props;
    const { isMobile } = useSidebar();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    return (
        <Box sx={{ px: 1, py: 1 }}>
            <ButtonBase
                onClick={handleOpen}
                sx={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 1,
                    p: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
                <UserInfo user={auth.user} />
                {!collapsed && <ExpandMoreIcon fontSize="small" sx={{ ml: 'auto' }} />}
            </ButtonBase>
            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                anchorOrigin={{ vertical: isMobile ? 'bottom' : 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: isMobile ? 'top' : 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { sx: { minWidth: 240 } } }}
            >
                <UserMenuContent user={auth.user} onClose={handleClose} />
            </Menu>
        </Box>
    );
}
