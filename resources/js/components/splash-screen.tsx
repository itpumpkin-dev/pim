import AppLogoIcon from '@/components/app-logo-icon';
import { keyframes } from '@emotion/react';
import { Box, CircularProgress } from '@mui/material';

const fadeInScale = keyframes`
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
`;

const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;

export default function SplashScreen({ exiting = false }: { exiting?: boolean }) {
    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                bgcolor: '#fff',
                opacity: exiting ? 0 : 1,
                transition: 'opacity 0.5s ease',
                pointerEvents: exiting ? 'none' : 'auto',
            }}
        >
            <Box sx={{ animation: `${fadeInScale} 0.6s ease both` }}>
                <AppLogoIcon style={{ width: 96, height: 96 }} />
            </Box>

            <CircularProgress
                size={26}
                thickness={4}
                sx={{
                    color: 'primary.main',
                    opacity: 0,
                    animation: `${fadeIn} 0.5s ease 0.35s forwards`,
                }}
            />
        </Box>
    );
}
