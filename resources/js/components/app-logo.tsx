import { Box, Typography } from '@mui/material';
import AppLogoIcon from './app-logo-icon';

export default function AppLogo({ collapsed = false }: { collapsed?: boolean }) {
    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    aspectRatio: '1 / 1',
                    width: 46,
                    height: 46,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 1,
                    color: 'primary.main',
                    flexShrink: 0,
                }}
            >
                <AppLogoIcon style={{ width: 46, height: 46, fill: 'currentColor' }} />
            </Box>
            {!collapsed && (
                <Box sx={{ ml: 1, display: 'grid', flex: 1, textAlign: 'left' }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 1000, lineHeight: 1, fontSize: 24, color: 'text.primary' }}>
                        PIM<Box component="span" sx={{ color: 'primary.main' }}>Pumpkin</Box>
                    </Typography>
                </Box>
            )}
        </>
    );
}
