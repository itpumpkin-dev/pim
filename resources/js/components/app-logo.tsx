import { Box, Typography } from '@mui/material';
import AppLogoIcon from './app-logo-icon';

export default function AppLogo() {
    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    aspectRatio: '1 / 1',
                    width: 32,
                    height: 32,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 1,
                    color: 'primary.main',
                }}
            >
                <AppLogoIcon style={{ width: 30, height: 30, fill: 'currentColor' }} />
            </Box>
            <Box sx={{ ml: 1, display: 'grid', flex: 1, textAlign: 'left' }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 1000, lineHeight: 1, fontSize: 24, color: 'text.primary' }}>
                    PIM<Box component="span" sx={{ color: 'primary.main' }}>Pumpkin</Box>
                </Typography>
            </Box>
        </>
    );
}
