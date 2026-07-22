import { useLocale } from '@/hooks/use-locale';
import { locales } from '@/lib/translations';
import TranslateIcon from '@mui/icons-material/Translate';
import { Box, IconButton, ListItemText, Menu, MenuItem, type BoxProps } from '@mui/material';
import { useState } from 'react';

export default function LocaleDropdown(props: BoxProps) {
    const { locale, setLocale } = useLocale();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    return (
        <Box {...props}>
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small" aria-label="Change language">
                <TranslateIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                {locales.map((option) => (
                    <MenuItem
                        key={option.value}
                        selected={option.value === locale}
                        onClick={() => {
                            setLocale(option.value);
                            setAnchorEl(null);
                        }}
                    >
                        <ListItemText>{option.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    );
}
