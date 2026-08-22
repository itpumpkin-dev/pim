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

// Long enough to be useful, short enough that the tooltip never turns into
// an unscrollable wall of text — Lazada's platform-attribute list alone can
// run past 60 entries (most of it category-specific specs/certifications).
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

/** Two small stat chips ("Payload fields: 8/9", "Platform attributes: 3/12") — each with a tooltip listing what's still unmapped, when anything is. */
export function MappingCoverageSummary({ payloadFields, platformAttributes }: MappingCoverageSummaryProps) {
    const { t } = useTranslation('catalog');

    return (
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
            <CoverageChip label={t('coveragePayloadLabel')} stat={payloadFields} />
            <CoverageChip label={t('coveragePlatformAttributesLabel')} stat={platformAttributes} />
        </Stack>
    );
}
