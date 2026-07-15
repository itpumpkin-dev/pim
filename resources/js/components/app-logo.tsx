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
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                }}
            >
                <AppLogoIcon style={{ width: 20, height: 20, fill: 'currentColor' }} />
            </Box>
            <Box sx={{ ml: 1, display: 'grid', flex: 1, textAlign: 'left' }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1 }}>
                    PimPK
                </Typography>
            </Box>
        </>
    );
}
