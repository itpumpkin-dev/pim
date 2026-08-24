import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Avatar, Box, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { FIORI, FioriStatus, fioriCardSx } from '@/lib/fiori-style';

interface Operation {
    method: string;
    endpoint: string;
    purpose: string;
    source: string;
    write: boolean;
}

interface OperationGroup {
    label: string;
    operations: Operation[];
}

interface PlatformApi {
    label: string;
    baseUrl: string;
    auth: string;
    tokenSource: string;
    groups: OperationGroup[];
    configured: boolean | null;
}

interface Props {
    platforms: Record<string, PlatformApi>;
}

// Same 4-color rotation used elsewhere for platform avatars (dashboard info
// boxes, salesPlatforms/index.tsx) — fixed order here since these platform
// keys are hardcoded (unlike salesPlatforms/index.tsx's admin-created ones).
const PLATFORM_COLORS: Record<string, string> = {
    shopee: PALETTE.highlight,
    lazada: PALETTE.accent,
    tiktok: PALETTE.primary,
    woocommerce: PALETTE.secondary,
};

export default function MarketplaceApiUsage({ platforms }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
    ];

    const platformKeys = Object.keys(platforms);
    const [activeKey, setActiveKey] = useState(platformKeys[0] ?? '');
    const active = platforms[activeKey];

    const columns: FioriResponsiveColumn<Operation>[] = [
        {
            key: 'method',
            header: t('apiOperationMethod'),
            priority: 'always',
            width: 90,
            render: (op) => (
                <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: FIORI.textPrimary }}>
                    {op.method}
                </Typography>
            ),
        },
        {
            key: 'endpoint',
            header: t('apiOperationEndpoint'),
            priority: 'always',
            minWidth: 220,
            render: (op) => (
                <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace', color: FIORI.textPrimary, wordBreak: 'break-word' }}>
                    {op.endpoint}
                </Typography>
            ),
        },
        {
            key: 'purpose',
            header: t('apiOperationPurpose'),
            priority: 'high',
            minWidth: 240,
            render: (op) => <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{op.purpose}</Typography>,
        },
        {
            key: 'write',
            header: '',
            priority: 'medium',
            render: (op) => <FioriStatus label={op.write ? t('apiWriteOperation') : t('apiReadOperation')} tone={op.write ? 'warning' : 'information'} />,
        },
        {
            key: 'source',
            header: t('apiOperationSource'),
            priority: 'low',
            render: (op) => (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary, wordBreak: 'break-word' }}>
                    {op.source}
                </Typography>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('apiUsageTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <SalesChannelSectionTabs active="apiUsage" />

                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('apiUsageTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25, maxWidth: 760 }}>
                        {t('apiUsageSubtitle')}
                    </Typography>
                </Box>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Tabs
                        value={activeKey}
                        onChange={(_, value: string) => setActiveKey(value)}
                        sx={{ px: 2, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        {platformKeys.map((key) => (
                            <Tab
                                key={key}
                                value={key}
                                iconPosition="start"
                                icon={
                                    <Avatar sx={{ width: 22, height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: PLATFORM_COLORS[key] ?? FIORI.brand }}>
                                        {platforms[key].label.charAt(0).toUpperCase()}
                                    </Avatar>
                                }
                                label={platforms[key].label}
                            />
                        ))}
                    </Tabs>

                    {active && (
                        <Box sx={{ p: 2.5 }}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 4 }} sx={{ mb: 3 }}>
                                <Box>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontWeight: 600 }}>
                                        {t('apiConfigured')}
                                    </Typography>
                                    <Box sx={{ mt: 0.5 }}>
                                        {active.configured === null ? (
                                            <FioriStatus label={t('apiConfiguredUnknown')} tone="neutral" />
                                        ) : active.configured ? (
                                            <FioriStatus label={t('apiConfigured')} tone="success" />
                                        ) : (
                                            <FioriStatus label={t('apiNotConfigured')} tone="error" />
                                        )}
                                    </Box>
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontWeight: 600 }}>
                                        {t('apiAuthMethod')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary, mt: 0.5 }}>
                                        {active.auth}
                                    </Typography>
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, fontWeight: 600 }}>
                                        {t('apiTokenSource')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary, mt: 0.5 }}>
                                        {active.tokenSource}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Stack spacing={3}>
                                {active.groups.map((group) => (
                                    <Box key={group.label}>
                                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                                            {group.label}
                                        </Typography>
                                        <FioriResponsiveTable
                                            columns={columns}
                                            rows={group.operations}
                                            getRowKey={(op) => `${op.method}:${op.endpoint}`}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        </Box>
                    )}
                </Paper>
            </Box>
        </AppLayout>
    );
}
