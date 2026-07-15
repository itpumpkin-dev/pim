import AppLogoIcon from '@/components/app-logo-icon';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Box, Stack, Typography } from '@mui/material';

interface AuthLayoutProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
}

export default function AuthSplitLayout({ children, title, description }: AuthLayoutProps) {
    const { name, quote } = usePage<SharedData>().props;

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'grid',
                minHeight: '100vh',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                px: { xs: 2, sm: 0 },
            }}
        >
            <Box
                sx={{
                    position: 'relative',
                    display: { xs: 'none', lg: 'flex' },
                    flexDirection: 'column',
                    height: '100%',
                    p: 5,
                    color: 'common.white',
                    bgcolor: '#18181b',
                }}
            >
                <Box
                    component={Link}
                    href={route('home')}
                    sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                >
                    <AppLogoIcon style={{ width: 32, height: 32, marginRight: 8, fill: 'currentColor' }} />
                    <Typography variant="h6">{name}</Typography>
                </Box>
                {quote && (
                    <Box sx={{ position: 'relative', zIndex: 1, mt: 'auto' }}>
                        <Stack spacing={1} component="blockquote" sx={{ m: 0 }}>
                            <Typography variant="body1">&ldquo;{quote.message}&rdquo;</Typography>
                            <Typography variant="body2" sx={{ color: 'grey.400' }} component="footer">
                                {quote.author}
                            </Typography>
                        </Stack>
                    </Box>
                )}
            </Box>
            <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', p: { lg: 4 } }}>
                <Box sx={{ mx: 'auto', display: 'flex', width: '100%', maxWidth: 350, flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                    <Box
                        component={Link}
                        href={route('home')}
                        sx={{
                            position: 'relative',
                            zIndex: 1,
                            display: { xs: 'flex', lg: 'none' },
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'text.primary',
                        }}
                    >
                        <AppLogoIcon style={{ height: 40, fill: 'currentColor' }} />
                    </Box>
                    <Stack spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} textAlign={{ xs: 'left', sm: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 500 }}>
                            {title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {description}
                        </Typography>
                    </Stack>
                    {children}
                </Box>
            </Box>
        </Box>
    );
}
