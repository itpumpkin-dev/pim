import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { FIORI, FioriStatus, fioriDefaultSx, type FioriTone } from '@/lib/fiori-style';

// ทำเป็นตารางแถวละแพลตฟอร์ม แทนที่จะเป็น picker-tile + panel รายละเอียดอันเดียว
// (ดีไซน์เดิมโชว์ action ได้ทีละแพลตฟอร์มเท่านั้น) — ตอนนี้เห็น action ของทุก
// แพลตฟอร์มพร้อมกันเลย จะเพิ่มแพลตฟอร์มใหม่ก็แค่เพิ่ม entry ตรงนี้กับ route ฝั่ง
// backend เพิ่มอีกอันเดียวจบ
//
// ตอนนี้การ sync/mapping ทั้งหมวดหมู่และแบรนด์ ย้ายไปอยู่ที่หน้า
// categories/{platform}-mapping.tsx ของแต่ละแพลตฟอร์มแล้ว (Shopee กับ Lazada
// ทำก่อน ส่วน TikTok กับ WooCommerce ตามมาทีหลังด้วยแนวทางเดียวกัน — ดู docblock
// ของแต่ละหน้า) — เพราะดูต้นไม้หมวดหมู่คู่กับ brand catalog ที่ผูกกันในหน้าเดียว
// มันดีกว่าทำเป็น hub กลางแยกทุก action ออกมา ไม่ใช่แค่เคสที่ brand catalog
// ผูกกับหมวดหมู่เท่านั้น หน้านี้เลยเหลือแค่ปุ่ม "Map" (ทางลัดไปหน้านั้น) กับ
// export/import ของ WooCommerce เอง ที่ยังไม่มีที่เฉพาะให้ไปอยู่
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', mappingRoute: '/catalog/categories/lazada-mapping', exportRoute: null, importRoute: null },
    { value: 'shopee', label: 'Shopee', mappingRoute: '/catalog/categories/shopee-mapping', exportRoute: null, importRoute: null },
    { value: 'tiktok', label: 'TikTok', mappingRoute: '/catalog/categories/tiktok-mapping', exportRoute: null, importRoute: null },
    {
        value: 'woocommerce',
        label: 'WooCommerce',
        mappingRoute: '/catalog/categories/woocommerce-mapping',
        exportRoute: '/catalog/categories/export-woocommerce',
        importRoute: '/catalog/categories/import-woocommerce',
    },
] as const;

type Platform = (typeof CATEGORY_SYNC_PLATFORMS)[number];

function formatLocalDateTime(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' });
}

/** โทนสี Fiori ObjectStatus บอกว่าเวลา sync เก่าแค่ไหน — ถ้ายังไม่เคย sync (หรือ parse วันที่ไม่ได้) จะถือเป็น neutral ไม่ใช่ error เพราะยังไม่มีอะไรผิดพลาด แค่ยังไม่ได้ทำเท่านั้นเอง */
function syncFreshnessTone(value: string | null): FioriTone {
    if (!value) return 'neutral';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'neutral';

    const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) return 'success';
    if (daysSince <= 30) return 'warning';
    return 'error';
}

interface Props {
    lastSyncedAt: Record<string, string | null>;
}

export default function CategoryMarketplaceSync({ lastSyncedAt }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('categories.edit_categories');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceSyncTitle'), href: '#' },
    ];

    // ใช้ key เป็นค่าของแพลตฟอร์ม ไม่ใช่ boolean ตัวเดียวใช้ร่วมกัน — เพราะปุ่ม
    // import ของแต่ละแถวต้องกดแยกอิสระจากกันได้ (ดีไซน์เดิมมีแพลตฟอร์มที่ "เลือกอยู่"
    // แค่ตัวเดียว เลยใช้ boolean ตัวเดียวพอ)
    const [importingPlatform, setImportingPlatform] = useState<string | null>(null);

    const runImport = (platform: Platform) => {
        if (!platform.importRoute) return;
        setImportingPlatform(platform.value);
        router.post(platform.importRoute, {}, { onFinish: () => setImportingPlatform(null) });
    };

    const columns: FioriResponsiveColumn<Platform>[] = [
        {
            key: 'marketplace',
            header: t('marketplaceColumn'),
            priority: 'always',
            minWidth: 200,
            render: (platform) => (
                <Stack spacing={0.5}>
                    <Typography fontWeight={600} sx={{ color: FIORI.textPrimary }}>{platform.label}</Typography>
                    <FioriStatus
                        label={t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[platform.value] ?? null) })}
                        tone={syncFreshnessTone(lastSyncedAt[platform.value] ?? null)}
                    />
                </Stack>
            ),
        },
        {
            key: 'manage',
            header: t('manageColumn'),
            priority: 'always',
            minWidth: 320,
            render: (platform) => {
                if (!canEdit) {
                    return (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, fontStyle: 'italic' }}>
                            —
                        </Typography>
                    );
                }

                const isImporting = importingPlatform === platform.value;

                return (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LinkIcon fontSize="small" />}
                            onClick={() => router.visit(platform.mappingRoute)}
                            sx={fioriDefaultSx}
                        >
                            {t('mapToPlatformCategories', { platform: platform.label })}
                        </Button>

                        {platform.exportRoute && (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<DownloadIcon fontSize="small" />}
                                component="a"
                                href={platform.exportRoute}
                                sx={fioriDefaultSx}
                            >
                                {t('exportCategoriesCsv')}
                            </Button>
                        )}

                        {platform.importRoute && (
                            <Button
                                size="small"
                                variant="outlined"
                                disabled={isImporting}
                                startIcon={isImporting ? <CircularProgress size={14} /> : <SystemUpdateAltIcon fontSize="small" />}
                                onClick={() => runImport(platform)}
                                sx={fioriDefaultSx}
                            >
                                {isImporting ? t('importingCategories') : t('importAsPimCategories')}
                            </Button>
                        )}
                    </Stack>
                );
            },
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceSyncTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{t('marketplaceSyncTitle')}</Typography>
                    <Typography sx={{ color: FIORI.textSecondary, mt: 0.5 }}>{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                <FioriResponsiveTable
                    columns={columns}
                    rows={[...CATEGORY_SYNC_PLATFORMS]}
                    getRowKey={(platform) => platform.value}
                />
            </Box>
        </AppLayout>
    );
}
