import { ProductPicker, type ProductOption } from '@/components/product-picker';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControl,
    FormControlLabel,
    FormHelperText,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface LocaleOption {
    code: string;
    display_name: string | null;
}

interface AttributeFamilyOption {
    code: string;
    name: string;
}

interface ShopOption {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
}

interface Props {
    locales: LocaleOption[];
    families: AttributeFamilyOption[];
    shops: ShopOption[];
}

export default function WooExport({ locales, families, shops }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
        { title: t('wooExportTitle'), href: '/import-export/woo-convert/export' },
    ];

    const [locale, setLocale] = useState(locales.find((l) => l.code === 'th')?.code ?? locales[0]?.code ?? '');
    const [shopId, setShopId] = useState('');
    const [familyCode, setFamilyCode] = useState('');
    const [enabledOnly, setEnabledOnly] = useState(false);
    const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
    const [products, setProducts] = useState<ProductOption[]>([]);
    const hasProductSelection = products.length > 0;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        params.set('locale', locale);
        params.set('format', format);
        if (shopId) params.set('shop_id', shopId);
        if (hasProductSelection) {
            products.forEach((p) => params.append('product_ids[]', String(p.id)));
        } else {
            if (familyCode) params.set('family_code', familyCode);
            if (enabledOnly) params.set('enabled_only', '1');
        }
        window.location.href = `/import-export/woo-convert/export/download?${params.toString()}`;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooExportTitle')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 720, mx: 'auto', bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('wooExportTitle')}</Typography>
                    <Button component={Link} href="/import-export/woo-convert" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                        {tCatalog('back')}
                    </Button>
                </Stack>

                <Alert severity="info" sx={{ mb: 3, whiteSpace: 'pre-line' }}>
                    {t('wooExportIntro')}
                </Alert>

                <Stack spacing={2}>
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('wooExportLanguageSectionTitle')}</Typography>
                        <Stack spacing={3}>
                            <FormControl fullWidth required>
                                <InputLabel id="woo-export-locale-label">{t('wooExportLocale')}</InputLabel>
                                <Select
                                    labelId="woo-export-locale-label"
                                    label={t('wooExportLocale')}
                                    value={locale}
                                    onChange={(e) => setLocale(e.target.value)}
                                >
                                    {locales.map((l) => (
                                        <MenuItem key={l.code} value={l.code}>{l.display_name || l.code}</MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>{t('wooExportLocaleHelp')}</FormHelperText>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="woo-export-shop-label">{t('wooExportShop')}</InputLabel>
                                <Select
                                    labelId="woo-export-shop-label"
                                    label={t('wooExportShop')}
                                    value={shopId}
                                    onChange={(e) => setShopId(e.target.value)}
                                >
                                    <MenuItem value=""><em>{t('wooExportShopNone')}</em></MenuItem>
                                    {shops.map((shop) => (
                                        <MenuItem key={shop.id} value={String(shop.id)}>{shop.name}</MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>
                                    {t('wooExportShopHelp')}
                                    {' '}
                                    <Link href="/catalog/sales-platforms" style={{ color: 'inherit', fontWeight: 600 }}>
                                        {t('wooExportManageShopsLink')}
                                    </Link>
                                </FormHelperText>
                            </FormControl>
                        </Stack>
                    </Paper>

                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('wooExportProductsSectionTitle')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mb: 1.5 }}>
                            {t('wooExportProductsHelp')}
                        </Typography>
                        <ProductPicker value={products} onChange={setProducts} />
                    </Paper>

                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3, opacity: hasProductSelection ? 0.5 : 1 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('wooExportFilterSectionTitle')}</Typography>
                        {hasProductSelection && (
                            <Alert severity="info" sx={{ mb: 2 }}>{t('wooExportFiltersIgnored')}</Alert>
                        )}
                        <Stack spacing={2}>
                            <FormControl fullWidth disabled={hasProductSelection}>
                                <InputLabel id="woo-export-family-label">{t('wooConvertFamilyCode')}</InputLabel>
                                <Select
                                    labelId="woo-export-family-label"
                                    label={t('wooConvertFamilyCode')}
                                    value={familyCode}
                                    onChange={(e) => setFamilyCode(e.target.value)}
                                >
                                    <MenuItem value=""><em>{t('wooExportAllFamilies')}</em></MenuItem>
                                    {families.map((family) => (
                                        <MenuItem key={family.code} value={family.code}>{family.name} ({family.code})</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={enabledOnly}
                                        disabled={hasProductSelection}
                                        onChange={(e) => setEnabledOnly(e.target.checked)}
                                    />
                                }
                                label={t('wooExportEnabledOnly')}
                            />
                        </Stack>
                    </Paper>

                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('wooExportFormatSectionTitle')}</Typography>
                        <FormControl fullWidth>
                            <InputLabel id="woo-export-format-label">{t('fileFormat')}</InputLabel>
                            <Select
                                labelId="woo-export-format-label"
                                label={t('fileFormat')}
                                value={format}
                                onChange={(e) => setFormat(e.target.value as 'csv' | 'xlsx')}
                            >
                                <MenuItem value="csv">CSV</MenuItem>
                                <MenuItem value="xlsx">XLSX</MenuItem>
                            </Select>
                        </FormControl>
                    </Paper>
                </Stack>

                <Button
                    type="submit"
                    fullWidth
                    size="large"
                    disabled={!locale}
                    startIcon={<DownloadIcon />}
                    sx={{ ...fioriEmphasizedSx, mt: 3, py: 1.25 }}
                >
                    {t('wooExportSubmit')}
                </Button>
            </Box>
        </AppLayout>
    );
}
