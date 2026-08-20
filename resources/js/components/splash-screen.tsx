import AppLogoIcon from '@/components/app-logo-icon';
import { keyframes } from '@emotion/react';
import { Box } from '@mui/material';

const breathe = keyframes`
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
`;

// transform/opacity only so the browser can run it on the compositor thread
// instead of repainting every frame.
const dotPulse = keyframes`
    0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
    40% { opacity: 1; transform: translateY(-4px); }
`;

const DOT_DELAYS = [0, 0.15, 0.3];

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
                gap: 2,
                bgcolor: '#fff',
                opacity: exiting ? 0 : 1,
                transition: 'opacity 0.5s ease',
                pointerEvents: exiting ? 'none' : 'auto',
            }}
        >
            <Box sx={{ animation: `${breathe} 1.8s ease-in-out infinite` }}>
                <AppLogoIcon style={{ width: 124, height: 124 }} />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                {DOT_DELAYS.map((delay) => (
                    <Box
                        key={delay}
                        sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '999px',
                            bgcolor: '#F26522',
                            animation: `${dotPulse} 1.2s ease-in-out infinite`,
                            animationDelay: `${delay}s`,
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}
