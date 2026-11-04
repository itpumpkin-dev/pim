import { useLocale } from '@/hooks/use-locale';
import { Input, Label, Title } from '@ui5/webcomponents-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

interface LocaleLabelFieldsProps {
    values: Record<string, string>;
    onChange: (localeId: string, value: string) => void;
    title?: string;
    description?: string;
    errors?: Record<string, string>;
}

const hintStyle = { display: 'block', color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' } as const;

export default function LocaleLabelFields({ values, onChange, title = 'Label', description, errors }: LocaleLabelFieldsProps) {
    const { locales, locale } = useLocale();
    const { t } = useTranslation('common');
    const idPrefix = useId();

    const activeLocales = locales.filter((loc) => loc.code === locale);
    const visibleLocales = activeLocales.length > 0 ? activeLocales : locales;

    return (
        <section
            style={{
                padding: '1.5rem',
                borderRadius: 'var(--sapElement_BorderCornerRadius)',
                border: '1px solid var(--sapGroup_ContentBorderColor)',
                background: 'var(--sapGroup_ContentBackground)',
            }}
        >
            <Title level="H5" size="H5" wrappingType="Normal" style={{ marginBottom: '0.25rem' }}>
                {title}
            </Title>
            {description && <span style={{ ...hintStyle, marginBottom: '0.25rem' }}>{description}</span>}
            <span style={{ ...hintStyle, marginBottom: '1rem' }}>{t('editableLocaleHint')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {visibleLocales.map((loc) => {
                    const id = `${idPrefix}-locale-${loc.id}`;
                    const error = errors?.[String(loc.id)];
                    return (
                        <div key={loc.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <Label for={id}>{loc.display_name ?? loc.code}</Label>
                            <Input
                                id={id}
                                style={{ width: '100%' }}
                                value={values[String(loc.id)] ?? ''}
                                onInput={(e) => onChange(String(loc.id), e.target.value)}
                                valueState={error ? 'Negative' : 'None'}
                                valueStateMessage={error ? <div>{error}</div> : undefined}
                            />
                            {error && <span style={{ ...hintStyle, color: 'var(--sapNegativeTextColor)' }}>{error}</span>}
                        </div>
                    );
                })}
                {locales.length === 0 && (
                    <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSize)' }}>{t('noActiveLocales')}</span>
                )}
            </div>
        </section>
    );
}
