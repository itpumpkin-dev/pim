import { router } from '@inertiajs/react';
import { Tab, TabContainer } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

export type SalesChannelSection = 'channels' | 'platforms' | 'apiUsage';

const ROUTE_BY_SECTION: Record<SalesChannelSection, string> = {
    channels: '/catalog/channels',
    platforms: '/catalog/sales-platforms',
    apiUsage: '/catalog/sales-platforms/api-usage',
};

const SECTIONS: SalesChannelSection[] = ['channels', 'platforms', 'apiUsage'];

/**
 * แถบแท็บ 3 อันนี้ ("ช่องทางขาย" / "แพลตฟอร์มขาย" / "การใช้งาน API") ใช้ร่วมกัน
 * ทุกหน้าในส่วน Sales Channels — แต่ละหน้าเป็น Inertia visit เต็มรูปแบบของตัวเอง
 * (ไม่ใช่ state แท็บฝั่ง client) ดังนั้นการสลับแท็บคือการนำทางจริงๆ ไปที่
 * `ROUTE_BY_SECTION[value]`
 */
export function SalesChannelSectionTabs({ active }: { active: SalesChannelSection }) {
    const { t } = useTranslation('catalog');

    const labels: Record<SalesChannelSection, string> = {
        channels: t('channelsTab'),
        platforms: t('salesPlatformsTab'),
        apiUsage: t('apiUsageTab'),
    };

    return (
        <TabContainer
            collapsed
            style={{ marginBottom: '1.5rem' }}
            onTabSelect={(e) => {
                const value = SECTIONS[e.detail.tabIndex];
                if (value && value !== active) router.visit(ROUTE_BY_SECTION[value]);
            }}
        >
            {SECTIONS.map((section) => (
                <Tab key={section} data-section={section} text={labels[section]} selected={section === active} />
            ))}
        </TabContainer>
    );
}
