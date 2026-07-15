import AppLogoIcon from '@/components/app-logo-icon';
import { Link } from '@inertiajs/react';
import { Box, Stack, Typography } from '@mui/material';

interface AuthLayoutProps {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <Box
            sx={{
                bgcolor: 'background.default',
                display: 'flex',
                minHeight: '100vh',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                p: { xs: 3, md: 5 },
            }}
        >
            <Box sx={{ width: '100%', maxWidth: 384 }}>
                <Stack spacing={4}>
                    <Stack spacing={2} alignItems="center">
                        <Box
                            component={Link}
                            href={route('home')}
                            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}
                        >
                            <Box sx={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                                <AppLogoIcon style={{ width: 36, height: 36, fill: 'currentColor' }} />
                            </Box>
                            <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                                {title}
                            </Box>
                        </Box>

                        <Stack spacing={1} alignItems="center" textAlign="center">
                            <Typography variant="h6" sx={{ fontWeight: 500 }}>
                                {title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {description}
                            </Typography>
                        </Stack>
                    </Stack>
                    {children}
                </Stack>
            </Box>
        </Box>
    );
}
