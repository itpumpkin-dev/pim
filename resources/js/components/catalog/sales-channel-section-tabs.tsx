import { router } from '@inertiajs/react';
import { Tab, Tabs } from '@mui/material';
import { useTranslation } from 'react-i18next';

export type SalesChannelSection = 'channels' | 'platforms' | 'apiUsage';

const ROUTE_BY_SECTION: Record<SalesChannelSection, string> = {
    channels: '/catalog/channels',
    platforms: '/catalog/sales-platforms',
    apiUsage: '/catalog/sales-platforms/api-usage',
};

/**
 * แถบแท็บ 3 อันนี้ ("ช่องทางขาย" / "แพลตฟอร์มขาย" / "การใช้งาน API") ใช้ร่วมกัน
 * ทุกหน้าในส่วน Sales Channels — แต่ละหน้าเป็น Inertia visit เต็มรูปแบบของตัวเอง
 * (ไม่ใช่ state แท็บฝั่ง client) ดังนั้นการสลับแท็บคือการนำทางจริงๆ ไปที่
 * `ROUTE_BY_SECTION[value]`
 */
export function SalesChannelSectionTabs({ active }: { active: SalesChannelSection }) {
    const { t } = useTranslation('catalog');

    return (
        <Tabs value={active} onChange={(_, value: SalesChannelSection) => router.visit(ROUTE_BY_SECTION[value])} sx={{ mb: 3 }}>
            <Tab value="channels" label={t('channelsTab')} />
            <Tab value="platforms" label={t('salesPlatformsTab')} />
            <Tab value="apiUsage" label={t('apiUsageTab')} />
        </Tabs>
    );
}
