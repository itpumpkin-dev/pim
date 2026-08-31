import { type Appearance, useAppearance } from '@/hooks/use-appearance';
import { fioriToggleButtonGroupSx } from '@/lib/fiori-style';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import { ToggleButton, ToggleButtonGroup, type ToggleButtonGroupProps, type SxProps, type Theme } from '@mui/material';

type AppearanceTabsProps = Omit<ToggleButtonGroupProps, 'value' | 'onChange' | 'exclusive'>;

export default function AppearanceToggleTab({ sx, ...props }: AppearanceTabsProps) {
    const { appearance, updateAppearance } = useAppearance();

    return (
        <ToggleButtonGroup
            value={appearance}
            exclusive
            size="small"
            onChange={(_event, value: Appearance | null) => {
                if (value) {
                    updateAppearance(value);
                }
            }}
            sx={[fioriToggleButtonGroupSx, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>}
            {...props}
        >
            <ToggleButton value="light">
                <LightModeIcon fontSize="small" sx={{ mr: 1 }} />
                Light
            </ToggleButton>
            <ToggleButton value="dark">
                <DarkModeIcon fontSize="small" sx={{ mr: 1 }} />
                Dark
            </ToggleButton>
            <ToggleButton value="system">
                <SettingsBrightnessIcon fontSize="small" sx={{ mr: 1 }} />
                System
            </ToggleButton>
        </ToggleButtonGroup>
    );
}
