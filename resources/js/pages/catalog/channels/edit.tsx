import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControl,
    ListItemText,
    MenuItem,
    Select,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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

    const { data, setData, put, processing, errors, transform, isDirty } = useForm({
        code: channel.code || '',
        translations: translations || ({} as Record<string, string>),
        root_category_id: (channel.root_category_id ?? 'none') as string | number,
        locale_ids: localeIds || [],
        currency_ids: currencyIds || [],
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({
            ...formData,
            root_category_id: formData.root_category_id === 'none' ? '' : formData.root_category_id,
        }));
        skipNavigationGuardRef.current = true;
        put(`/catalog/channels/${channel.id}`, {
            onSuccess: () => router.visit('/catalog/channels', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editChannel')}: ${channel.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/channels/${channel.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editChannel')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/channels" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField label={t('code')} htmlFor="channel-code" hint={t('codeLockedHelperText')}>
                            <TextField id="channel-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
                        </FioriField>

                        <FioriField label={t('rootCategoryOptional')} htmlFor="root-category">
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx('none')}>
                                <Select
                                    id="root-category"
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
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('currenciesAndLocalesTitle')}>
                        <FioriField
                            label={t('localesRequired')}
                            htmlFor="channel-locales"
                            required
                            valueState={valueStateOf(errors.locale_ids)}
                            message={errors.locale_ids}
                            fullWidth
                        >
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.locale_ids))}>
                                <Select
                                    id="channel-locales"
                                    multiple
                                    value={data.locale_ids}
                                    onChange={(e) => setData('locale_ids', e.target.value as number[])}
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
                            </FormControl>
                        </FioriField>

                        <FioriField
                            label={t('currenciesRequired')}
                            htmlFor="channel-currencies"
                            required
                            valueState={valueStateOf(errors.currency_ids)}
                            message={errors.currency_ids}
                            fullWidth
                        >
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.currency_ids))}>
                                <Select
                                    id="channel-currencies"
                                    multiple
                                    value={data.currency_ids}
                                    onChange={(e) => setData('currency_ids', e.target.value as number[])}
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
                            </FormControl>
                        </FioriField>
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
                </>
                )}
            </Box>
        </AppLayout>
    );
}
