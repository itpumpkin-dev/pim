import AppLogoIcon from '@/components/app-logo-icon';
import { Link } from '@inertiajs/react';
import { Box, Card, CardContent, CardHeader, Stack, Typography } from '@mui/material';

export default function AuthCardLayout({
    children,
    title,
    description,
}: {
    children: React.ReactNode;
    name?: string;
    title?: string;
    description?: string;
}) {
    return (
        <Box
            sx={{
                bgcolor: 'action.hover',
                display: 'flex',
                minHeight: '100vh',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                p: { xs: 3, md: 5 },
            }}
        >
            <Box sx={{ width: '100%', maxWidth: 448, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box
                    component={Link}
                    href={route('home')}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, alignSelf: 'center', textDecoration: 'none', color: 'inherit' }}
                >
                    <Box sx={{ display: 'flex', height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }}>
                        <AppLogoIcon style={{ width: 36, height: 36, fill: 'currentColor' }} />
                    </Box>
                </Box>

                <Card sx={{ borderRadius: 3 }}>
                    <CardHeader
                        sx={{ px: 5, pt: 4, pb: 0, textAlign: 'center' }}
                        title={
                            <Typography variant="h6" component="p">
                                {title}
                            </Typography>
                        }
                        subheader={description}
                    />
                    <CardContent sx={{ px: 5, py: 4 }}>
                        <Stack spacing={3}>{children}</Stack>
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
}
