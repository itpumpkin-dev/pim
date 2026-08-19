import AppLogoIcon from '@/components/app-logo-icon';
import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';

const fadeInScale = keyframes`
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
`;

const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;

// From Uiverse.io by mrpumps31232 (adapted: sized down to sit under the
// splash logo instead of its original 300x100 footprint, and colored from
// the theme's primary color instead of a hardcoded blue).
const loadingWave = keyframes`
    0% { height: 6px; }
    50% { height: 24px; }
    100% { height: 6px; }
`;

const WAVE_BAR_DELAYS = [0, 0.1, 0.2, 0.3];

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
                <AppLogoIcon style={{ width: 124, height: 124 }} />
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    height: 24,
                    opacity: 0,
                    animation: `${fadeIn} 0.5s ease 0.35s forwards`,
                }}
            >
                {WAVE_BAR_DELAYS.map((delay) => (
                    <Box
                        key={delay}
                        sx={{
                            width: 8,
                            height: 6,
                            mx: 0.5,
                            bgcolor: 'primary.main',
                            borderRadius: '4px',
                            animation: `${loadingWave} 1s ease-in-out infinite`,
                            animationDelay: `${delay}s`,
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}
