import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { HistoryPanel } from '@/components/history-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControl,
    FormHelperText,
    InputLabel,
    ListItemText,
    MenuItem,
    OutlinedInput,
    Paper,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ChannelItem {
    id: number;
    code: string;
    root_category_id: number | null;
}

interface RootCategoryOption {
    id: number;
    code: string;
    name: string;
    display_name: string;
}

interface LocaleOption {
    id: number;
    code: string;
    display_name: string | null;
}

interface CurrencyOption {
    id: number;
    code: string;
    name: string | null;
}

interface Props {
    channel: ChannelItem;
    translations: Record<string, string>;
    localeIds: number[];
    currencyIds: number[];
    rootCategories: RootCategoryOption[];
    locales: LocaleOption[];
    currencies: CurrencyOption[];
    canViewHistory?: boolean;
}

export default function ChannelEdit({ channel, translations, localeIds, currencyIds, rootCategories, locales, currencies, canViewHistory = false }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
        { title: t('editChannel'), href: '#' },
    ];

    const { data, setData, put, processing, errors, transform } = useForm({
        code: channel.code || '',
        translations: translations || ({} as Record<string, string>),
        root_category_id: (channel.root_category_id ?? 'none') as string | number,
        locale_ids: localeIds || [],
        currency_ids: currencyIds || [],
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({
            ...formData,
            root_category_id: formData.root_category_id === 'none' ? '' : formData.root_category_id,
        }));
        put(`/catalog/channels/${channel.id}`, {
            onSuccess: () => router.visit('/catalog/channels', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editChannel')}: ${channel.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/channels/${channel.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('editChannel')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/channels" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button sx={{ color: 'white' }} type="submit" variant="contained" disabled={processing} startIcon={<SaveIcon />}>
                            {t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('generalTitle')}</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label={t('codeRequired')}
                                required
                                fullWidth
                                value={data.code}
                                onChange={(e) => setData('code', e.target.value)}
                                error={Boolean(errors.code)}
                                helperText={errors.code ?? t('codeHelperText')}
                            />
                            <FormControl fullWidth>
                                <InputLabel id="root-category-label">{t('rootCategoryOptional')}</InputLabel>
                                <Select
                                    labelId="root-category-label"
                                    label={t('rootCategoryOptional')}
                                    value={data.root_category_id}
                                    onChange={(e) => setData('root_category_id', e.target.value)}
                                >
                                    <MenuItem value="none">
                                        <em>{t('noRootCategory')}</em>
                                    </MenuItem>
                                    {rootCategories.map((cat) => (
                                        <MenuItem key={cat.id} value={cat.id}>
                                            {cat.display_name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Paper>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('currenciesAndLocalesTitle')}</Typography>
                        <Stack spacing={3}>
                            <FormControl fullWidth required error={Boolean(errors.locale_ids)}>
                                <InputLabel id="channel-locales-label">{t('localesRequired')}</InputLabel>
                                <Select
                                    labelId="channel-locales-label"
                                    multiple
                                    value={data.locale_ids}
                                    onChange={(e) => setData('locale_ids', e.target.value as number[])}
                                    input={<OutlinedInput label={t('localesRequired')} />}
                                    renderValue={(selected) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {(selected as number[]).map((id) => {
                                                const locale = locales.find((l) => l.id === id);
                                                return <Chip key={id} label={locale?.display_name ?? locale?.code ?? id} size="small" />;
                                            })}
                                        </Box>
                                    )}
                                >
                                    {locales.map((locale) => (
                                        <MenuItem key={locale.id} value={locale.id}>
                                            <Checkbox checked={data.locale_ids.includes(locale.id)} />
                                            <ListItemText primary={locale.display_name ?? locale.code} />
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.locale_ids && <FormHelperText>{errors.locale_ids}</FormHelperText>}
                            </FormControl>

                            <FormControl fullWidth required error={Boolean(errors.currency_ids)}>
                                <InputLabel id="channel-currencies-label">{t('currenciesRequired')}</InputLabel>
                                <Select
                                    labelId="channel-currencies-label"
                                    multiple
                                    value={data.currency_ids}
                                    onChange={(e) => setData('currency_ids', e.target.value as number[])}
                                    input={<OutlinedInput label={t('currenciesRequired')} />}
                                    renderValue={(selected) => (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {(selected as number[]).map((id) => {
                                                const currency = currencies.find((c) => c.id === id);
                                                return <Chip key={id} label={currency?.code ?? id} size="small" />;
                                            })}
                                        </Box>
                                    )}
                                >
                                    {currencies.map((currency) => (
                                        <MenuItem key={currency.id} value={currency.id}>
                                            <Checkbox checked={data.currency_ids.includes(currency.id)} />
                                            <ListItemText primary={currency.name ? `${currency.code} — ${currency.name}` : currency.code} />
                                        </MenuItem>
                                    ))}
                                </Select>
                                {errors.currency_ids && <FormHelperText>{errors.currency_ids}</FormHelperText>}
                            </FormControl>
                        </Stack>
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctHighlightedFields')}
                    </Alert>
                )}
                </>
                )}
            </Box>
        </AppLayout>
    );
}
