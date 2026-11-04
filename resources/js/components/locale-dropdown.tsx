import { useLocale } from '@/hooks/use-locale';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import { Button, List, ListItemStandard, ResponsivePopover, type ListPropTypes } from '@ui5/webcomponents-react';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

// Real flag artwork (circle-flags — already-circular SVGs) instead of flag
// emoji: Windows doesn't render regional-indicator emoji pairs as flags at
// all (most fonts there fall back to showing the two letters themselves,
// e.g. "GB"/"TH"/"CN" in little boxes), so the dropdown looked broken on
// every Windows machine even though it rendered fine on macOS/Android.
// Statically importing just the ~20 flags this app actually offers (via
// Vite's `?url`) keeps the bundle to a handful of small SVGs instead of
// pulling in circle-flags' full 400+ flag set.
import flagCn from 'circle-flags/flags/cn.svg?url';
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

export function FlagIcon({ localeCode, size = 26, slot }: { localeCode: string; size?: number; slot?: string }) {
    const url = flagUrl(localeCode);

    return (
        <span
            slot={slot}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.7,
                lineHeight: 1,
                flexShrink: 0,
                background: 'var(--sapNeutralBackgroundColor)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            }}
        >
            {url ? <img src={url} alt="" width={size} height={size} style={{ display: 'block' }} /> : '🌐'}
        </span>
    );
}

interface LocaleMenuProps {
    open: boolean;
    opener: HTMLElement | null;
    onClose: () => void;
}

/**
 * The locale picker popover on its own — opened from the standalone
 * LocaleDropdown button below, or from the ShellBar's globe item
 * (app-sidebar-header.tsx), which supplies its own opener element.
 */
export function LocaleMenu({ open, opener, onClose }: LocaleMenuProps) {
    const { t } = useTranslation('common');
    const { locale, locales, setLocale } = useLocale();

    const onItemClick: ListPropTypes['onItemClick'] = (e) => {
        const code = (e.detail.item as HTMLElement).dataset.code;
        if (code) setLocale(code);
        onClose();
    };

    return (
        <ResponsivePopover
            open={open && !!opener}
            opener={opener ?? undefined}
            onClose={onClose}
            placement="Bottom"
            horizontalAlign="End"
            accessibleName={t('language')}
        >
            <List selectionMode="Single" separators="Inner" onItemClick={onItemClick} style={{ minWidth: 220 }}>
                {locales.map(({ code, display_name }) => (
                    <ListItemStandard
                        key={code}
                        data-code={code}
                        text={display_name ?? code}
                        selected={code === locale}
                        image={<FlagIcon localeCode={code} />}
                    />
                ))}
            </List>
        </ResponsivePopover>
    );
}

/**
 * Standalone locale switcher button (flag + language name) — used outside
 * the app shell (login, storefront home, product page). Inside the shell the
 * same popover hangs off the ShellBar instead.
 */
export default function LocaleDropdown({ style, className }: { style?: CSSProperties; className?: string }) {
    const { t } = useTranslation('common');
    const { locale, locales } = useLocale();
    const [opener, setOpener] = useState<HTMLElement | null>(null);

    const current = locales.find((l) => l.code === locale);

    return (
        <span style={{ display: 'inline-flex', ...style }} className={className}>
            <Button
                design="Transparent"
                endIcon="slim-arrow-down"
                accessibleName={t('language')}
                tooltip={t('language')}
                onClick={(e) => setOpener(opener ? null : (e.currentTarget as HTMLElement))}
                style={{ borderRadius: 999, border: '1px solid var(--sapButton_BorderColor)' }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--sapBrandColor)' }}>
                    <FlagIcon localeCode={locale ?? 'en'} size={20} />
                    {current?.display_name ?? t('language')}
                </span>
            </Button>
            <LocaleMenu open={!!opener} opener={opener} onClose={() => setOpener(null)} />
        </span>
    );
}
