import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Label, Tab, TabContainer, Title } from '@ui5/webcomponents-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterListPage } from '../master-crud';

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

    const mono = { fontFamily: 'monospace', wordBreak: 'break-word' } as const;
    const fieldLabel = (text: string) => (
        <Label showColon={false} style={{ fontWeight: 600 }}>
            {text}
        </Label>
    );

    const columns: FioriResponsiveColumn<Operation>[] = [
        {
            key: 'method',
            header: t('apiOperationMethod'),
            priority: 'always',
            width: 90,
            render: (op) => <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--sapFontSmallSize)' }}>{op.method}</span>,
        },
        {
            key: 'endpoint',
            header: t('apiOperationEndpoint'),
            priority: 'always',
            minWidth: 220,
            render: (op) => <span style={mono}>{op.endpoint}</span>,
        },
        {
            key: 'purpose',
            header: t('apiOperationPurpose'),
            priority: 'high',
            minWidth: 240,
            render: (op) => op.purpose,
        },
        {
            key: 'write',
            header: '',
            priority: 'medium',
            render: (op) => (
                <FioriStatus label={op.write ? t('apiWriteOperation') : t('apiReadOperation')} tone={op.write ? 'warning' : 'information'} />
            ),
        },
        {
            key: 'source',
            header: t('apiOperationSource'),
            priority: 'low',
            render: (op) => <span style={{ ...mono, fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>{op.source}</span>,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('apiUsageTitle')} />
            <MasterListPage before={<SalesChannelSectionTabs active="apiUsage" />} title={t('apiUsageTitle')} intro={t('apiUsageSubtitle')}>
                <div
                    style={{
                        background: 'var(--sapGroup_ContentBackground)',
                        border: '1px solid var(--sapGroup_ContentBorderColor)',
                        borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        overflow: 'hidden',
                    }}
                >
                    <TabContainer
                        collapsed
                        onTabSelect={(e) => {
                            const key = e.detail.tab.dataset.key;
                            if (key) setActiveKey(key);
                        }}
                    >
                        {platformKeys.map((key) => (
                            <Tab key={key} data-key={key} text={platforms[key].label} selected={key === activeKey} />
                        ))}
                    </TabContainer>

                    {active && (
                        <div style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 2rem', marginBottom: '1.5rem' }}>
                                <div>
                                    {fieldLabel(t('apiConfigured'))}
                                    <div style={{ marginTop: '0.25rem' }}>
                                        {active.configured === null ? (
                                            <FioriStatus label={t('apiConfiguredUnknown')} tone="neutral" />
                                        ) : active.configured ? (
                                            <FioriStatus label={t('apiConfigured')} tone="success" />
                                        ) : (
                                            <FioriStatus label={t('apiNotConfigured')} tone="error" />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    {fieldLabel(t('apiAuthMethod'))}
                                    <div style={{ marginTop: '0.25rem' }}>{active.auth}</div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {fieldLabel(t('apiTokenSource'))}
                                    <div style={{ marginTop: '0.25rem' }}>{active.tokenSource}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {active.groups.map((group) => (
                                    <div key={group.label}>
                                        <Title level="H4" size="H6" style={{ marginBottom: '0.5rem' }}>
                                            {group.label}
                                        </Title>
                                        <FioriResponsiveTable
                                            columns={columns}
                                            rows={group.operations}
                                            getRowKey={(op) => `${op.method}:${op.endpoint}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </MasterListPage>
        </AppLayout>
    );
}
