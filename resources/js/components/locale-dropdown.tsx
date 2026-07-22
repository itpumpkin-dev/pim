import { useLocale } from '@/hooks/use-locale';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Box, ButtonBase, Menu, MenuItem, Typography, type BoxProps } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Maps an ISO 639-1 language code to the ISO 3166-1 country code whose flag
// conventionally represents it (e.g. English -> GB), so locales without an
// identically-named country still get a sensible flag.
const COUNTRY_BY_LANGUAGE: Record<string, string> = {
    en: 'gb',
    th: 'th',
    fr: 'fr',
    da: 'dk',
    no: 'no',
    nb: 'no',
    nn: 'no',
    sv: 'se',
    de: 'de',
    es: 'es',
    it: 'it',
    pt: 'pt',
    nl: 'nl',
    ja: 'jp',
    zh: 'cn',
    ko: 'kr',
    vi: 'vn',
    id: 'id',
    ru: 'ru',
    ar: 'sa',
    hi: 'in',
};

function flagEmoji(localeCode: string) {
    const language = localeCode.split('-')[0].toLowerCase();
    const country = COUNTRY_BY_LANGUAGE[language] ?? language;

    if (country.length !== 2) {
        return '🌐';
    }

    const codePoints = [...country.toUpperCase()].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
}

export default function LocaleDropdown(props: BoxProps) {
    const { t } = useTranslation('common');
    const { locale, locales, setLocale } = useLocale();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const select = (code: string) => {
        setLocale(code);
        setAnchorEl(null);
    };

    return (
        <Box {...props}>
            <ButtonBase
                onClick={(e) => setAnchorEl(e.currentTarget)}
                aria-label={t('language')}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.75,
                    py: 0.75,
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
                <Typography variant="body2" fontWeight={700} color="primary.main">
                    {t('language')}
                </Typography>
                <KeyboardArrowDownIcon fontSize="small" sx={{ color: 'primary.main' }} />
            </ButtonBase>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{
                    paper: { sx: { mt: 1, minWidth: 220, borderRadius: 2 } },
                    list: { sx: { py: 0 } },
                }}
            >
                {locales.map(({ code, display_name }, index) => (
                    <MenuItem
                        key={code}
                        selected={code === locale}
                        onClick={() => select(code)}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            py: 1.25,
                            px: 2,
                            borderBottom: index < locales.length - 1 ? 1 : 0,
                            borderColor: 'divider',
                        }}
                    >
                        <Box
                            sx={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                                lineHeight: 1,
                                flexShrink: 0,
                                boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
                            }}
                        >
                            {flagEmoji(code)}
                        </Box>
                        <Typography variant="body2">{display_name ?? code}</Typography>
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    );
}
