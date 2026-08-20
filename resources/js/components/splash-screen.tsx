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

// From Uiverse.io by adamgiebl
const dotPulse = keyframes`
    0% {
        transform: scale(0.8);
        background-color: #ffcc99;
        box-shadow: 0 0 0 0 rgba(255, 204, 153, 0.7);
    }
    50% {
        transform: scale(1.2);
        background-color: #ff8c1a;
        box-shadow: 0 0 0 10px rgba(255, 204, 153, 0);
    }
    100% {
        transform: scale(0.8);
        background-color: #ffcc99;
        box-shadow: 0 0 0 0 rgba(255, 204, 153, 0.7);
    }
`;

const DOT_DELAYS = [-0.3, -0.1, 0.1];

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
                gap: 1,
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
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    animation: `${fadeIn} 0.5s ease 0.35s forwards`,
                }}
            >
                {DOT_DELAYS.map((delay, index) => (
                    <Box
                        key={delay}
                        sx={{
                            width: 12,
                            height: 12,
                            mr: index === DOT_DELAYS.length - 1 ? 0 : '6px',
                            borderRadius: '6px',
                            bgcolor: '#ffcc99',
                            animation: `${dotPulse} 1.5s ease-in-out infinite`,
                            animationDelay: `${delay}s`,
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}
