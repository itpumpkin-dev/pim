import AppLogoIcon from '@/components/app-logo-icon';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';

export default function Welcome() {
    const { auth } = usePage<SharedData>().props;

    return (
        <>
            <Head title="Welcome" />
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.default',
                }}
            >
                <Box component="header" sx={{ px: 3, py: 3, display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
                    {auth.user ? (
                        <Button component={Link} href={route('dashboard')} variant="outlined">
                            Dashboard
                        </Button>
                    ) : (
                        <>
                            <Button component={Link} href={route('login')} variant="text">
                                Log in
                            </Button>
                            <Button component={Link} href={route('register')} variant="outlined">
                                Register
                            </Button>
                        </>
                    )}
                </Box>

                <Container maxWidth="sm" sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <Stack spacing={3} alignItems="center">
                        <Box sx={{ color: 'primary.main' }}>
                            <AppLogoIcon style={{ width: 56, height: 56, fill: 'currentColor' }} />
                        </Box>
                        <Typography variant="h3" sx={{ fontWeight: 600 }}>
                            PIM <span style={{ fontWeight: 800, color: '#FF5733' }}>Pumpkin</span>
                        </Typography>
                        <Typography variant="body1" color="text.secondary">
                            Products Management Information
                        </Typography>
                        {/* <Stack direction="row" spacing={2}>
                            <Button component="a" href="https://laravel.com/docs" target="_blank" rel="noopener noreferrer" variant="text">
                                Documentation
                            </Button>
                            <Button component="a" href="https://laracasts.com" target="_blank" rel="noopener noreferrer" variant="text">
                                Laracasts
                            </Button>
                            <Button component="a" href="https://cloud.laravel.com" target="_blank" rel="noopener noreferrer" variant="contained">
                                Deploy now
                            </Button>
                        </Stack> */}
                    </Stack>
                </Container>
            </Box>
        </>
    );
}
