import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Button, Divider, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LazadaAttributeMappingPanel, type LazadaAttributeMappingPanelProps } from '@/components/catalog/lazada-attribute-mapping-panel';
import { ShopeeAttributeMappingPanel, type ShopeeAttributeMappingPanelProps } from '@/components/catalog/shopee-attribute-mapping-panel';
import { TikTokAttributeMappingPanel, type TikTokAttributeMappingPanelProps } from '@/components/catalog/tiktok-attribute-mapping-panel';
import { WooCommerceAttributeMappingPanel, type WooCommerceAttributeMappingPanelProps } from '@/components/catalog/woocommerce-attribute-mapping-panel';

interface Props {
    woocommerce: WooCommerceAttributeMappingPanelProps;
    shopee: ShopeeAttributeMappingPanelProps;
    lazada: LazadaAttributeMappingPanelProps;
    tiktok: TikTokAttributeMappingPanelProps;
}

/**
 * One entry point for every platform's "which PIM attribute feeds which
 * marketplace attribute" mapping — previously four separate hub tiles/pages
 * (woocommerce-mapping.tsx, shopee-mapping.tsx, lazada-mapping.tsx,
 * tiktok-mapping.tsx). Each platform's actual mapping UI now lives in its
 * own panel component under components/catalog/*-attribute-mapping-panel.tsx
 * (identical behavior to the old standalone pages, just without their own
 * AppLayout/breadcrumb/header) — this page only owns the Tabs shell.
 *
 * Once a tab has been opened it stays mounted (toggled with `display`, not
 * unmounted) so switching back to it never discards a panel's unsaved
 * pending edits/search/filter state — same reasoning products/edit.tsx's
 * General/History tabs don't need, since only this page's tabs carry
 * editable state. A tab never opened yet, though, isn't mounted at all: with
 * ~100 PIM attributes each rendering a full MUI card (Select + TextField),
 * mounting all four up front at once was making the page visibly stall on
 * first load for a render of ~400 cards nobody was looking at yet — this
 * defers each tab's cost to the moment it's actually opened.
 */
export default function MarketplaceAttributeMapping({ woocommerce, shopee, lazada, tiktok }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceAttributeMapping'), href: '#' },
    ];

    const [tabIndex, setTabIndex] = useState(0);
    const [openedTabs, setOpenedTabs] = useState<Set<number>>(new Set([0]));

    const handleTabChange = (index: number) => {
        setTabIndex(index);
        setOpenedTabs((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceAttributeMapping')} />
            <Box sx={{ p: 4 }}>
                <Button
                    size="small"
                    startIcon={<ArrowBackIcon fontSize="small" />}
                    onClick={() => router.visit('/catalog/management/marketplace')}
                    sx={{ textTransform: 'none', mb: 1, color: 'text.secondary' }}
                >
                    {t('manageEcommerceMarketplaceTab')}
                </Button>
                <Typography variant="h4" fontWeight={700}>{t('marketplaceAttributeMapping')}</Typography>
                <Divider sx={{ my: 1 }} />
                <Typography color="text.secondary" sx={{ maxWidth: 840, mb: 3 }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Typography>

                <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => handleTabChange(v)}
                        sx={{
                            '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, fontSize: '0.95rem', minWidth: 100 },
                            '& .Mui-selected': { color: 'text.primary' },
                            '& .MuiTabs-indicator': { bgcolor: 'grey.800', height: 3 },
                        }}
                    >
                        <Tab label="WooCommerce" />
                        <Tab label="Shopee" />
                        <Tab label="Lazada" />
                        <Tab label="TikTok" />
                    </Tabs>
                </Box>

                {openedTabs.has(0) && (
                    <Box sx={{ pt: 3, display: tabIndex === 0 ? 'block' : 'none' }}>
                        <WooCommerceAttributeMappingPanel attributes={woocommerce.attributes} wooCommerceAttributes={woocommerce.wooCommerceAttributes} />
                    </Box>
                )}
                {openedTabs.has(1) && (
                    <Box sx={{ pt: 3, display: tabIndex === 1 ? 'block' : 'none' }}>
                        <ShopeeAttributeMappingPanel attributes={shopee.attributes} shopeeAttributes={shopee.shopeeAttributes} />
                    </Box>
                )}
                {openedTabs.has(2) && (
                    <Box sx={{ pt: 3, display: tabIndex === 2 ? 'block' : 'none' }}>
                        <LazadaAttributeMappingPanel attributes={lazada.attributes} lazadaAttributes={lazada.lazadaAttributes} />
                    </Box>
                )}
                {openedTabs.has(3) && (
                    <Box sx={{ pt: 3, display: tabIndex === 3 ? 'block' : 'none' }}>
                        <TikTokAttributeMappingPanel attributes={tiktok.attributes} tiktokAttributes={tiktok.tiktokAttributes} />
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
