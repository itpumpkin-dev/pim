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
 * The 3-way tab bar ("ช่องทางขาย" / "แพลตฟอร์มขาย" / "การใช้งาน API") shared by
 * every page in the Sales Channels section — each page is its own full
 * Inertia visit (not client-side tab state), so switching tabs is a real
 * navigation to `ROUTE_BY_SECTION[value]`.
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
