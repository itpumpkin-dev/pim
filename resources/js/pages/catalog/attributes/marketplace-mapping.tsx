import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Box, Button, CircularProgress, Divider, Tab, Tabs, Typography } from '@mui/material';
import { useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { LazadaAttributeMappingPanel, type LazadaAttributeMappingPanelProps } from '@/components/catalog/lazada-attribute-mapping-panel';
import { ShopeeAttributeMappingPanel, type ShopeeAttributeMappingPanelProps } from '@/components/catalog/shopee-attribute-mapping-panel';
import { TikTokAttributeMappingPanel, type TikTokAttributeMappingPanelProps } from '@/components/catalog/tiktok-attribute-mapping-panel';
import { WooCommerceAttributeMappingPanel, type WooCommerceAttributeMappingPanelProps } from '@/components/catalog/woocommerce-attribute-mapping-panel';
import { FIORI, fioriGhostSx } from '@/lib/fiori-style';

interface Props {
    woocommerce: WooCommerceAttributeMappingPanelProps;
    shopee: ShopeeAttributeMappingPanelProps;
    lazada: LazadaAttributeMappingPanelProps;
    tiktok: TikTokAttributeMappingPanelProps;
}

/**
 * เพจนี้เป็นจุดรวมเดียวสำหรับ mapping "แอตทริบิวต์ PIM ตัวไหน ป้อนค่าให้แอตทริบิวต์
 * มาร์เก็ตเพลสตัวไหน" ของทุกแพลตฟอร์ม — เมื่อก่อนแยกเป็น 4 หน้า/tile กันคนละที่
 * (woocommerce-mapping.tsx, shopee-mapping.tsx, lazada-mapping.tsx,
 * tiktok-mapping.tsx) ตอนนี้ UI การ mapping จริงๆ ของแต่ละแพลตฟอร์มย้ายไปอยู่ใน
 * panel component ของตัวเองที่ components/catalog/*-attribute-mapping-panel.tsx
 * (พฤติกรรมเหมือนหน้าเดิมทุกอย่าง แค่ไม่มี AppLayout/breadcrumb/header ของตัวเอง
 * แล้ว) — เพจนี้เลยดูแลแค่ shell ของ Tabs เท่านั้น
 *
 * พอแท็บไหนถูกเปิดแล้วจะค้าง mount ไว้ตลอด (สลับด้วย `display` ไม่ได้ unmount ออก)
 * เพื่อให้กลับมาแท็บนั้นแล้วข้อมูลที่แก้ไว้/ค้นหา/กรองไว้ยังอยู่ครบ ไม่หายไปไหน —
 * เหตุผลเดียวกับที่แท็บ General/History ใน products/edit.tsx ไม่จำเป็นต้องทำแบบนี้
 * เพราะมีแค่แท็บของเพจนี้เท่านั้นที่มี state ที่แก้ไขได้ ส่วนแท็บที่ยังไม่เคยเปิดเลย
 * จะยังไม่ mount เลย เพราะแอตทริบิวต์ PIM มีประมาณ 100 ตัว แต่ละตัว render เป็น
 * MUI card เต็มๆ (Select + TextField) ถ้า mount ทั้ง 4 แท็บพร้อมกันตั้งแต่แรกจะทำให้
 * หน้าเว็บกระตุกเห็นชัดตอนโหลดครั้งแรก จาก card ที่ render ~400 ใบที่ยังไม่มีใครดูด้วยซ้ำ
 * — โค้ดตรงนี้เลยเลื่อนต้นทุนของแต่ละแท็บไปจนกว่าจะถูกเปิดจริงๆ
 *
 * แต่การ mount ตอนเปิดครั้งแรกก็ยังเป็นการ render แบบ synchronous ของ Select/TextField
 * ประมาณ 100 แถวอยู่ดี ซึ่งอาจใช้เวลานานพอที่จะรู้สึกเหมือนคลิกแล้วไม่มีอะไรเกิดขึ้น
 * การสลับแท็บเลยรันอยู่ใน transition (isPending) เพื่อให้ React ยังคง panel เดิมค้าง
 * อยู่บนจอ — แค่ทำให้จางลงพร้อม spinner — แทนที่จะปล่อยให้พื้นที่ทั้งหมดว่างเปล่า
 * ระหว่างรอ panel ใหม่เตรียมพร้อม
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
    const [isPending, startTransition] = useTransition();

    const handleTabChange = (index: number) => {
        startTransition(() => {
            setTabIndex(index);
            setOpenedTabs((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceAttributeMapping')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Button
                    size="small"
                    startIcon={<ArrowBackIcon fontSize="small" />}
                    onClick={() => router.visit('/catalog/management/marketplace')}
                    sx={{ ...fioriGhostSx, mb: 1 }}
                >
                    {t('manageEcommerceMarketplaceTab')}
                </Button>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('marketplaceAttributeMapping')}</Typography>
                <Divider sx={{ my: 1, borderColor: FIORI.border }} />
                <Typography variant="body2" sx={{ color: FIORI.textSecondary, maxWidth: 840, mb: 3 }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Typography>

                <Box sx={{ bgcolor: FIORI.surface, borderBottom: `1px solid ${FIORI.border}`, display: 'flex', alignItems: 'center' }}>
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => handleTabChange(v)}
                        sx={{
                            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.95rem', minWidth: 100, color: FIORI.textSecondary },
                            '& .Mui-selected': { color: FIORI.brand },
                            '& .MuiTabs-indicator': { bgcolor: FIORI.brand, height: 2 },
                        }}
                    >
                        <Tab label="WooCommerce" />
                        <Tab label="Shopee" />
                        <Tab label="Lazada" />
                        <Tab label="TikTok" />
                    </Tabs>
                    {isPending && <CircularProgress size={18} thickness={5} sx={{ ml: 2 }} />}
                </Box>

                <Box sx={{ position: 'relative' }}>
                    {isPending && (
                        <Box
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 1.5,
                                pt: 8,
                                bgcolor: 'rgba(255,255,255,0.7)',
                            }}
                        >
                            <CircularProgress size={32} />
                            <Typography variant="body2" color="text.secondary">
                                {t('marketplaceAttributeMappingTabLoading')}
                            </Typography>
                        </Box>
                    )}

                    {openedTabs.has(0) && (
                        <Box sx={{ pt: 3, display: tabIndex === 0 ? 'block' : 'none' }}>
                            <WooCommerceAttributeMappingPanel
                                attributes={woocommerce.attributes}
                                wooCommerceAttributes={woocommerce.wooCommerceAttributes}
                                coverage={woocommerce.coverage}
                            />
                        </Box>
                    )}
                    {openedTabs.has(1) && (
                        <Box sx={{ pt: 3, display: tabIndex === 1 ? 'block' : 'none' }}>
                            <ShopeeAttributeMappingPanel attributes={shopee.attributes} shopeeAttributes={shopee.shopeeAttributes} coverage={shopee.coverage} />
                        </Box>
                    )}
                    {openedTabs.has(2) && (
                        <Box sx={{ pt: 3, display: tabIndex === 2 ? 'block' : 'none' }}>
                            <LazadaAttributeMappingPanel attributes={lazada.attributes} lazadaAttributes={lazada.lazadaAttributes} coverage={lazada.coverage} />
                        </Box>
                    )}
                    {openedTabs.has(3) && (
                        <Box sx={{ pt: 3, display: tabIndex === 3 ? 'block' : 'none' }}>
                            <TikTokAttributeMappingPanel attributes={tiktok.attributes} tiktokAttributes={tiktok.tiktokAttributes} coverage={tiktok.coverage} />
                        </Box>
                    )}
                </Box>
            </Box>
        </AppLayout>
    );
}
