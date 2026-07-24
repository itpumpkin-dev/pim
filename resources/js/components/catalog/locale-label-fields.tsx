import { useLocale } from '@/hooks/use-locale';
import { Paper, Stack, TextField, Typography } from '@mui/material';

interface LocaleLabelFieldsProps {
    values: Record<string, string>;
    onChange: (localeId: string, value: string) => void;
    title?: string;
    errors?: Record<string, string>;
}

export default function LocaleLabelFields({ values, onChange, title = 'Label', errors }: LocaleLabelFieldsProps) {
    const { locales } = useLocale();

    return (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
            <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
                {title}
            </Typography>
            <Stack spacing={2}>
                {locales.map((locale) => (
                    <TextField
                        key={locale.id}
                        label={locale.display_name ?? locale.code}
                        fullWidth
                        size="small"
                        value={values[String(locale.id)] ?? ''}
                        onChange={(e) => onChange(String(locale.id), e.target.value)}
                        error={Boolean(errors?.[String(locale.id)])}
                        helperText={errors?.[String(locale.id)]}
                    />
                ))}
                {locales.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        No active locales configured.
                    </Typography>
                )}
            </Stack>
        </Paper>
    );
}
