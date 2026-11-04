import { FioriField, FioriFormGroup, FioriMessageStrip } from '@/components/fiori-form';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import { Button, CheckBox, Option, Select, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

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

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
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
            <form onSubmit={submit} className={styles.page} style={{ maxWidth: 720, marginInline: 'auto' }}>
                <div className={styles.header}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('wooExportTitle')}
                    </Title>
                    <Button icon="nav-back" onClick={() => router.visit('/import-export/woo-convert')}>
                        {tCatalog('back')}
                    </Button>
                </div>

                <FioriMessageStrip severity="information" style={{ marginBottom: '1.5rem', whiteSpace: 'pre-line' }}>
                    {t('wooExportIntro')}
                </FioriMessageStrip>

                <div className={styles.stack}>
                    <FioriFormGroup title={t('wooExportLanguageSectionTitle')}>
                        <FioriField
                            label={t('wooExportLocale')}
                            htmlFor="woo-export-locale"
                            required
                            hint={t('wooExportLocaleHelp')}
                            labelWidth={160}
                        >
                            <Select
                                id="woo-export-locale"
                                className={styles.fullWidth}
                                required
                                value={locale}
                                onChange={(e) => setLocale(e.detail.selectedOption.value ?? locale)}
                            >
                                {locales.map((l) => (
                                    <Option key={l.code} value={l.code}>
                                        {l.display_name || l.code}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        <FioriField
                            label={t('wooExportShop')}
                            htmlFor="woo-export-shop"
                            labelWidth={160}
                            hint={
                                <>
                                    {t('wooExportShopHelp')}{' '}
                                    <Link href="/catalog/sales-platforms" style={{ color: 'var(--sapLinkColor)', fontWeight: 600 }}>
                                        {t('wooExportManageShopsLink')}
                                    </Link>
                                </>
                            }
                        >
                            <Select
                                id="woo-export-shop"
                                className={styles.fullWidth}
                                value={shopId}
                                onChange={(e) => setShopId(e.detail.selectedOption.value ?? '')}
                            >
                                <Option value="">{t('wooExportShopNone')}</Option>
                                {shops.map((shop) => (
                                    <Option key={shop.id} value={String(shop.id)}>
                                        {shop.name}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('wooExportProductsSectionTitle')} description={t('wooExportProductsHelp')}>
                        <ProductPicker value={products} onChange={setProducts} />
                    </FioriFormGroup>

                    <FioriFormGroup title={t('wooExportFilterSectionTitle')} style={{ opacity: hasProductSelection ? 0.5 : 1 }}>
                        {hasProductSelection && <FioriMessageStrip severity="information">{t('wooExportFiltersIgnored')}</FioriMessageStrip>}
                        <FioriField label={t('wooConvertFamilyCode')} htmlFor="woo-export-family" labelWidth={160}>
                            <Select
                                id="woo-export-family"
                                className={styles.fullWidth}
                                disabled={hasProductSelection}
                                value={familyCode}
                                onChange={(e) => setFamilyCode(e.detail.selectedOption.value ?? '')}
                            >
                                <Option value="">{t('wooExportAllFamilies')}</Option>
                                {families.map((family) => (
                                    <Option key={family.code} value={family.code}>
                                        {family.name} ({family.code})
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>
                        <CheckBox
                            text={t('wooExportEnabledOnly')}
                            checked={enabledOnly}
                            disabled={hasProductSelection}
                            onChange={(e) => setEnabledOnly(e.target.checked)}
                        />
                    </FioriFormGroup>

                    <FioriFormGroup title={t('wooExportFormatSectionTitle')}>
                        <FioriField label={t('fileFormat')} htmlFor="woo-export-format" labelWidth={160}>
                            <Select
                                id="woo-export-format"
                                className={styles.fullWidth}
                                value={format}
                                onChange={(e) => setFormat((e.detail.selectedOption.value ?? format) as 'csv' | 'xlsx')}
                            >
                                <Option value="csv">CSV</Option>
                                <Option value="xlsx">XLSX</Option>
                            </Select>
                        </FioriField>
                    </FioriFormGroup>
                </div>

                <Button
                    design="Emphasized"
                    icon="download"
                    disabled={!locale}
                    onClick={() => submit()}
                    style={{ width: '100%', marginTop: '1.5rem' }}
                >
                    {t('wooExportSubmit')}
                </Button>
            </form>
        </AppLayout>
    );
}
