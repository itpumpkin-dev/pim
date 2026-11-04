import { Tag } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import { percentToneFiori } from '@/lib/fiori-tokens';

export interface CoverageStat {
    total: number;
    mapped: number;
    missing: string[];
}

interface MappingCoverageSummaryProps {
    payloadFields: CoverageStat;
    platformAttributes: CoverageStat;
}

// ตั้งไว้ให้ยาวพอจะมีประโยชน์ แต่สั้นพอที่ tooltip จะไม่กลายเป็นกำแพงข้อความ
// ที่เลื่อนดูไม่ได้ — แค่ลิสต์ platform-attribute ของ Lazada อย่างเดียวก็มี
// ได้เกิน 60 รายการแล้ว (ส่วนใหญ่เป็น spec/ใบรับรองเฉพาะ category)
const MAX_TOOLTIP_ITEMS = 15;

const TONE_DESIGN = { success: 'Positive', warning: 'Critical', error: 'Negative' } as const;

function CoverageChip({ label, stat }: { label: string; stat: CoverageStat }) {
    const percent = stat.total > 0 ? Math.round((stat.mapped / stat.total) * 100) : 100;
    const design = TONE_DESIGN[percentToneFiori(percent)];
    const { t } = useTranslation('catalog');

    // tooltip แบบ native (title) — หนึ่งบรรทัดต่อหนึ่งรายการที่ยังไม่ได้ map
    const shown = stat.missing.slice(0, MAX_TOOLTIP_ITEMS);
    const remaining = stat.missing.length - shown.length;
    const tooltip =
        stat.missing.length === 0 ? undefined : [...shown, ...(remaining > 0 ? [t('coverageMoreItems', { count: remaining })] : [])].join('\n');

    return (
        <span title={tooltip} style={{ display: 'inline-flex' }}>
            <Tag design={design} hideStateIcon>
                {`${label}: ${stat.mapped}/${stat.total}`}
            </Tag>
        </span>
    );
}

/** ชิปสถิติเล็กๆ 2 อัน ("Payload fields: 8/9", "Platform attributes: 3/12") — แต่ละอันมี tooltip แสดงรายการที่ยังไม่ได้ map ไว้ ถ้ามี */
export function MappingCoverageSummary({ payloadFields, platformAttributes }: MappingCoverageSummaryProps) {
    const { t } = useTranslation('catalog');

    return (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <CoverageChip label={t('coveragePayloadLabel')} stat={payloadFields} />
            <CoverageChip label={t('coveragePlatformAttributesLabel')} stat={platformAttributes} />
        </div>
    );
}
