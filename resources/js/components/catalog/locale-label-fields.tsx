import { useLocale } from '@/hooks/use-locale';
import { FIORI } from '@/lib/fiori-style';
import { Paper, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface LocaleLabelFieldsProps {
    values: Record<string, string>;
    onChange: (localeId: string, value: string) => void;
    title?: string;
    description?: string;
    errors?: Record<string, string>;
}

export default function LocaleLabelFields({ values, onChange, title = 'Label', description, errors }: LocaleLabelFieldsProps) {
    const { locales, locale } = useLocale();
    const { t } = useTranslation('common');

    const activeLocales = locales.filter((loc) => loc.code === locale);
    const visibleLocales = activeLocales.length > 0 ? activeLocales : locales;

    return (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: FIORI.surface }}>
            <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 0.5 }}>
                {title}
            </Typography>
            {description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {description}
                </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {t('editableLocaleHint')}
            </Typography>
            <Stack spacing={2}>
                {visibleLocales.map((loc) => (
                    <TextField
                        key={loc.id}
                        label={loc.display_name ?? loc.code}
                        fullWidth
                        size="small"
                        value={values[String(loc.id)] ?? ''}
                        onChange={(e) => onChange(String(loc.id), e.target.value)}
                        error={Boolean(errors?.[String(loc.id)])}
                        helperText={errors?.[String(loc.id)]}
                    />
                ))}
                {locales.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {t('noActiveLocales')}
                    </Typography>
                )}
            </Stack>
        </Paper>
    );
}
