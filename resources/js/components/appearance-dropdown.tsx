import { useAppearance } from '@/hooks/use-appearance';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { Box, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, type BoxProps } from '@mui/material';
import { useState } from 'react';

export default function AppearanceToggleDropdown(props: BoxProps) {
    const { appearance, updateAppearance } = useAppearance();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const getCurrentIcon = () => {
        switch (appearance) {
            case 'dark':
                return <DarkModeIcon fontSize="small" />;
            case 'light':
                return <LightModeIcon fontSize="small" />;
            default:
                return <SettingsBrightnessIcon fontSize="small" />;
        }
    };

    const select = (mode: typeof appearance) => {
        updateAppearance(mode);
        setAnchorEl(null);
    };

    return (
        <Box {...props}>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small" aria-label="Toggle theme">
                {getCurrentIcon()}
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={() => select('light')}>
                    <ListItemIcon>
                        <LightModeIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Light</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => select('dark')}>
                    <ListItemIcon>
                        <DarkModeIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Dark</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => select('system')}>
                    <ListItemIcon>
                        <SettingsBrightnessIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>System</ListItemText>
                </MenuItem>
            </Menu>
        </Box>
    );
}
