import { useLocale } from '@/hooks/use-locale';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Box, ButtonBase, Menu, MenuItem, Typography, type BoxProps } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Real flag artwork (circle-flags — already-circular SVGs) instead of flag
// emoji: Windows doesn't render regional-indicator emoji pairs as flags at
// all (most fonts there fall back to showing the two letters themselves,
// e.g. "GB"/"TH"/"CN" in little boxes), so the dropdown looked broken on
// every Windows machine even though it rendered fine on macOS/Android.
// Statically importing just the ~20 flags this app actually offers (via
// Vite's `?url`) keeps the bundle to a handful of small SVGs instead of
// pulling in circle-flags' full 400+ flag set.
import flagDe from 'circle-flags/flags/de.svg?url';
import flagDk from 'circle-flags/flags/dk.svg?url';
import flagEs from 'circle-flags/flags/es.svg?url';
import flagFr from 'circle-flags/flags/fr.svg?url';
import flagGb from 'circle-flags/flags/gb.svg?url';
import flagId from 'circle-flags/flags/id.svg?url';
import flagIn from 'circle-flags/flags/in.svg?url';
import flagIt from 'circle-flags/flags/it.svg?url';
import flagJp from 'circle-flags/flags/jp.svg?url';
import flagKr from 'circle-flags/flags/kr.svg?url';
import flagCn from 'circle-flags/flags/cn.svg?url';
import flagNl from 'circle-flags/flags/nl.svg?url';
import flagNo from 'circle-flags/flags/no.svg?url';
import flagPt from 'circle-flags/flags/pt.svg?url';
import flagRu from 'circle-flags/flags/ru.svg?url';
import flagSa from 'circle-flags/flags/sa.svg?url';
import flagSe from 'circle-flags/flags/se.svg?url';
import flagTh from 'circle-flags/flags/th.svg?url';
import flagVn from 'circle-flags/flags/vn.svg?url';

// Maps an ISO 639-1 language code to the flag image whose country
// conventionally represents it (e.g. English -> GB), so locales without an
// identically-named country still get a sensible flag.
const FLAG_BY_LANGUAGE: Record<string, string> = {
    en: flagGb,
    th: flagTh,
    fr: flagFr,
    da: flagDk,
    no: flagNo,
    nb: flagNo,
    nn: flagNo,
    sv: flagSe,
    de: flagDe,
    es: flagEs,
    it: flagIt,
    pt: flagPt,
    nl: flagNl,
    ja: flagJp,
    zh: flagCn,
    ko: flagKr,
    vi: flagVn,
    id: flagId,
    ru: flagRu,
    ar: flagSa,
    hi: flagIn,
};

function flagUrl(localeCode: string): string | undefined {
    const language = localeCode.split('-')[0].toLowerCase();
    return FLAG_BY_LANGUAGE[language];
}

function FlagIcon({ localeCode, size = 26 }: { localeCode: string; size?: number }) {
    const url = flagUrl(localeCode);

    return (
        <Box
            sx={{
                width: size,
                height: size,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.7,
                lineHeight: 1,
                flexShrink: 0,
                bgcolor: 'action.hover',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            }}
        >
            {url ? <img src={url} alt="" width={size} height={size} style={{ display: 'block' }} /> : '🌐'}
        </Box>
    );
}

export default function LocaleDropdown(props: BoxProps) {
    const { t } = useTranslation('common');
    const { locale, locales, setLocale } = useLocale();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    const select = (code: string) => {
        setLocale(code);
        setAnchorEl(null);
    };

    const current = locales.find((l) => l.code === locale);

    return (
        <Box {...props}>
            <ButtonBase
                onClick={(e) => setAnchorEl(e.currentTarget)}
                aria-label={t('language')}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    pl: 0.75,
                    pr: 1.5,
                    py: 0.5,
                    borderRadius: 999,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
                <FlagIcon localeCode={locale ?? 'en'} size={22} />
                <Typography variant="body2" fontWeight={700} color="primary.main">
                    {current?.display_name ?? t('language')}
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
                        <FlagIcon localeCode={code} />
                        <Typography variant="body2">{display_name ?? code}</Typography>
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    );
}
