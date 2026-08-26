import { Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { percentTone } from '@/lib/ui-style';

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

function CoverageChip({ label, stat }: { label: string; stat: CoverageStat }) {
    const percent = stat.total > 0 ? Math.round((stat.mapped / stat.total) * 100) : 100;
    const tone = percentTone(percent);
    const { t } = useTranslation('catalog');

    const chip = (
        <Chip
            label={`${label}: ${stat.mapped}/${stat.total}`}
            size="small"
            sx={{ bgcolor: tone.bg, color: tone.fg, fontWeight: 600 }}
        />
    );

    if (stat.missing.length === 0) {
        return chip;
    }

    const shown = stat.missing.slice(0, MAX_TOOLTIP_ITEMS);
    const remaining = stat.missing.length - shown.length;

    return (
        <Tooltip
            arrow
            title={
                <Stack spacing={0.25} sx={{ py: 0.5 }}>
                    {shown.map((item) => (
                        <Typography key={item} variant="caption">
                            {item}
                        </Typography>
                    ))}
                    {remaining > 0 && (
                        <Typography variant="caption" sx={{ fontStyle: 'italic', opacity: 0.8 }}>
                            {t('coverageMoreItems', { count: remaining })}
                        </Typography>
                    )}
                </Stack>
            }
        >
            <span>{chip}</span>
        </Tooltip>
    );
}

/** ชิปสถิติเล็กๆ 2 อัน ("Payload fields: 8/9", "Platform attributes: 3/12") — แต่ละอันมี tooltip แสดงรายการที่ยังไม่ได้ map ไว้ ถ้ามี */
export function MappingCoverageSummary({ payloadFields, platformAttributes }: MappingCoverageSummaryProps) {
    const { t } = useTranslation('catalog');

    return (
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
            <CoverageChip label={t('coveragePayloadLabel')} stat={payloadFields} />
            <CoverageChip label={t('coveragePlatformAttributesLabel')} stat={platformAttributes} />
        </Stack>
    );
}
