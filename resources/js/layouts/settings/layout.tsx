import Heading from '@/components/heading';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Box, Divider, List, ListItemButton, ListItemText, Stack } from '@mui/material';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profile',
        url: '/settings/profile',
        icon: null,
    },
    {
        title: 'Password',
        url: '/settings/password',
        icon: null,
    },
    {
        title: 'Appearance',
        url: '/settings/appearance',
        icon: null,
    },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const currentPath = window.location.pathname;

    return (
        <Box sx={{ px: 2, py: 3 }}>
            <Heading title="Settings" description="Manage your profile and account settings" />

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 4, lg: 6 }}>
                <Box component="aside" sx={{ width: '100%', maxWidth: { xs: 'none', lg: 192 } }}>
                    <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {sidebarNavItems.map((item) => (
                            <ListItemButton
                                key={item.url}
                                component={Link}
                                href={item.url}
                                prefetch
                                selected={currentPath === item.url}
                                sx={{ borderRadius: 1 }}
                            >
                                <ListItemText primary={item.title} />
                            </ListItemButton>
                        ))}
                    </List>
                </Box>

                <Divider sx={{ display: { xs: 'block', lg: 'none' } }} />

                <Box sx={{ flex: 1, maxWidth: { lg: 672 } }}>
                    <Stack spacing={6} sx={{ maxWidth: 576 }}>
                        {children}
                    </Stack>
                </Box>
            </Stack>
        </Box>
    );
}
