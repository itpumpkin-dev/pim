import { Breadcrumbs } from '@/components/breadcrumbs';
import { UserMenuContent } from '@/components/user-menu-content';
import { useInitials } from '@/hooks/use-initials';
import { type BreadcrumbItem, type NavItem, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import MenuIcon from '@mui/icons-material/Menu';
import BookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import { AppBar, Avatar, Box, Button, Divider, Drawer, IconButton, Menu, Stack, Toolbar, Tooltip } from '@mui/material';
import { useState } from 'react';
import AppLogo from './app-logo';

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: DashboardIcon,
    },
];


interface AppHeaderProps {
    breadcrumbs?: BreadcrumbItem[];
}

export function AppHeader({ breadcrumbs = [] }: AppHeaderProps) {
    const page = usePage<SharedData>();
    const { auth } = page.props;
    const getInitials = useInitials();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    return (
        <>
            <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar sx={{ mx: 'auto', width: '100%', maxWidth: 1280 }}>
                    <IconButton sx={{ display: { xs: 'inline-flex', lg: 'none' }, mr: 1 }} onClick={() => setMobileOpen(true)} aria-label="Open menu">
                        <MenuIcon />
                    </IconButton>

                    <Box
                        component={Link}
                        href="/dashboard"
                        prefetch
                        sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                    >
                        <AppLogo />
                    </Box>

                    <Stack direction="row" spacing={1} sx={{ ml: 4, display: { xs: 'none', lg: 'flex' } }}>
                        {mainNavItems.map((item) => {
                            const isActive = page.url === item.url;
                            return (
                                <Button
                                    key={item.title}
                                    component={Link}
                                    href={item.url}
                                    prefetch
                                    startIcon={item.icon ? <item.icon fontSize="small" /> : undefined}
                                    color="inherit"
                                    sx={{
                                        borderRadius: 0,
                                        borderBottom: 2,
                                        borderColor: isActive ? 'text.primary' : 'transparent',
                                        fontWeight: isActive ? 600 : 400,
                                    }}
                                >
                                    {item.title}
                                </Button>
                            );
                        })}
                    </Stack>

                    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton>
                            <SearchIcon />
                        </IconButton>

                        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.5 }}>
                            <Avatar src={auth.user.avatar_url} alt={auth.user.name} sx={{ width: 32, height: 32, fontSize: 14 }}>
                                {getInitials(auth.user.name)}
                            </Avatar>
                        </IconButton>
                        <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={() => setAnchorEl(null)}
                            slotProps={{ paper: { sx: { minWidth: 240 } } }}
                        >
                            <UserMenuContent user={auth.user} onClose={() => setAnchorEl(null)} />
                        </Menu>
                    </Box>
                </Toolbar>

                {breadcrumbs.length > 1 && (
                    <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1280, px: 2, py: 1.5 }}>
                            <Breadcrumbs breadcrumbs={breadcrumbs} />
                        </Box>
                    </Box>
                )}
            </AppBar>

            <Drawer anchor="left" open={mobileOpen} onClose={() => setMobileOpen(false)}>
                <Box sx={{ width: 260, height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                        <AppLogo />
                    </Box>
                    <Stack spacing={0.5}>
                        {mainNavItems.map((item) => (
                            <Button
                                key={item.title}
                                component={Link}
                                href={item.url}
                                prefetch
                                onClick={() => setMobileOpen(false)}
                                startIcon={item.icon ? <item.icon fontSize="small" /> : undefined}
                                color="inherit"
                                sx={{ justifyContent: 'flex-start' }}
                            >
                                {item.title}
                            </Button>
                        ))}
                    </Stack>
                    </Stack>
                </Box>
            </Drawer>
        </>
    );
}
