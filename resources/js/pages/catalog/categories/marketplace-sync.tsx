import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FIORI, FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

// ทำเป็นตารางแถวละแพลตฟอร์ม แทนที่จะเป็น picker-tile + panel รายละเอียดอันเดียว
// (ดีไซน์เดิมโชว์ action ได้ทีละแพลตฟอร์มเท่านั้น) — ตอนนี้เห็นสถานะ sync ของทุก
// แพลตฟอร์มพร้อมกันเลย จะเพิ่มแพลตฟอร์มใหม่ก็แค่เพิ่ม entry ตรงนี้กับ route ฝั่ง
// backend เพิ่มอีกอันเดียวจบ
//
// การ sync/mapping ทั้งหมวดหมู่และแบรนด์ของแต่ละแพลตฟอร์ม รวมถึงปุ่ม export/
// import CSV ของ WooCommerce เอง ตอนนี้ย้ายไปอยู่ที่มาสเตอร์ > มาร์เก็ตเพลส >
// {แพลตฟอร์ม} หมดแล้ว (category-mapping ยังอยู่ที่หน้า categories/
// {platform}-mapping.tsx เดิม — ดู docblock ของไฟล์นั้นๆ) หน้านี้เลยเหลือแค่
// ตารางแสดงสถานะ sync ล่าสุดของแต่ละแพลตฟอร์มอย่างเดียว ไม่มี action ให้กดแล้ว
// — ยังคงไว้เพราะยังมี back-link/breadcrumb จากหน้า {platform}-mapping.tsx
// ทั้ง 4 ชี้กลับมาที่นี่อยู่
const PLATFORMS = [
    { value: 'lazada', label: 'Lazada' },
    { value: 'shopee', label: 'Shopee' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'woocommerce', label: 'WooCommerce' },
] as const;

type Platform = (typeof PLATFORMS)[number];

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

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('marketplaceSyncTitle'), href: '#' },
    ];

    const columns: FioriResponsiveColumn<Platform>[] = [
        {
            key: 'marketplace',
            header: t('marketplaceColumn'),
            priority: 'always',
            minWidth: 200,
            render: (platform) => (
                <Stack spacing={0.5}>
                    <Typography fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {platform.label}
                    </Typography>
                    <FioriStatus
                        label={t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[platform.value] ?? null) })}
                        tone={syncFreshnessTone(lastSyncedAt[platform.value] ?? null)}
                    />
                </Stack>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceSyncTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                        {t('marketplaceSyncTitle')}
                    </Typography>
                    <Typography sx={{ color: FIORI.textSecondary, mt: 0.5 }}>{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                <FioriResponsiveTable columns={columns} rows={[...PLATFORMS]} getRowKey={(platform) => platform.value} />
            </Box>
        </AppLayout>
    );
}
