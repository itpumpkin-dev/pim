import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import { Button, Input, Menu, MenuItem, Option, Select, Tag, type ButtonDomRef } from '@ui5/webcomponents-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { CoverageStat, MappingCoverageSummary } from '@/components/catalog/mapping-coverage-summary';
import { MappingSearchInput, MappingSyncButton, mappingStyles } from '@/components/catalog/marketplace-mapping-ui';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { MappingAttributeRow } from '@/hooks/use-attribute-mapping';
import { useLocale } from '@/hooks/use-locale';
import { encodeQueryParams } from '@/lib/query-string';

import styles from './attribute-mapping-table.module.css';

export interface AttributeMappingTableProps {
    /** แท็บของตลาดไหนอยู่ — ใช้ระบุว่าจะ export ชุดข้อมูลไหนใน `MarketplaceAttributeMappingController::export()` */
    platform: 'woocommerce' | 'shopee' | 'lazada' | 'tiktok';
    helpTextKey: string;
    syncLabelKey: string;
    coverage: { payloadFields: CoverageStat; platformAttributes: CoverageStat };

    search: string;
    onSearchChange: (value: string) => void;
    status: 'all' | 'mapped' | 'unmapped';
    onStatusChange: (value: 'all' | 'mapped' | 'unmapped') => void;

    filtered: MappingAttributeRow[];
    isMapped: (row: MappingAttributeRow) => boolean;
    hasPendingChange: (row: MappingAttributeRow) => boolean;
    /** ข้อความใต้ chip สถานะที่บอกว่าเป็น mapping แบบไหน ("Payload field" / "Shopee attribute" / ...) — ถ้าเป็น null จะไม่แสดงอะไรเลย (ฟิลด์ content ของ WooCommerce ที่ไม่ใช่ payload ไม่มีความต่างแบบนี้ให้บอก) */
    statusCaption: (row: MappingAttributeRow) => string | null;
    /** <Select> เฉพาะแต่ละแพลตฟอร์มสำหรับ cell "Map to" ของแถวนี้ — เพราะกลุ่ม/รูปแบบการเข้ารหัส prefix ต่างกันมากพอในแต่ละแพลตฟอร์ม (structured fields, content fields, ลิสต์ custom-attribute ที่มีกฎ disabled ของตัวเอง) เลยให้เป็น render prop แทนที่จะทำเป็น config กลาง */
    renderMapToCell: (row: MappingAttributeRow) => ReactNode;
    sortOrderFor: (row: MappingAttributeRow) => number;
    onSortOrderChange: (row: MappingAttributeRow, value: number) => void;

    pendingCount: number;
    saving: boolean;
    onSave: () => void;
    syncing: boolean;
    onSync: () => void;
}

/**
 * เชลล์ตารางกลางที่ใช้ร่วมกันของทุกหน้า mapping panel แบบ "จับคู่เนื้อหา <Platform>"
 * — มีตัวกรอง search/status, สรุป coverage และตัวตารางแอตทริบิวต์เอง
 * ส่วน panel component บางๆ ของแต่ละแพลตฟอร์มจะเป็นคนส่ง Select "Map to"
 * เข้ามาเอง (ผ่าน `renderMapToCell` เพราะกลุ่ม/รูปแบบการเข้ารหัส prefix ของ
 * dropdown ต่างกันจริงๆ ในแต่ละแพลตฟอร์ม) และส่วน save/sync ก็ต่อเข้ามาเอง
 * (ผ่าน `useAttributeMapping`)
 */
export function AttributeMappingTable({
    platform,
    helpTextKey,
    syncLabelKey,
    coverage,
    search,
    onSearchChange,
    status,
    onStatusChange,
    filtered,
    isMapped,
    hasPendingChange,
    statusCaption,
    renderMapToCell,
    sortOrderFor,
    onSortOrderChange,
    pendingCount,
    saving,
    onSave,
    syncing,
    onSync,
}: AttributeMappingTableProps) {
    const { t } = useTranslation('catalog');
    const { locale } = useLocale();
    const [exportOpen, setExportOpen] = useState(false);
    const exportButtonRef = useRef<ButtonDomRef | null>(null);

    // ลำดับความสำคัญของคอลัมน์ตอนจอเล็ก (SAP Fiori responsive table): คอลัมน์
    // ที่ใช้ระบุตัวตน กับ select "Map to" — ฟิลด์ที่กำลังแก้ไขจริงๆ ตรงนี้ — จะ
    // ยังคงแสดงอยู่แม้จอเล็กระดับมือถือ ส่วน Status กับ Sort order จะไหลไป
    // อยู่ในพื้นที่ label/value ใต้แต่ละแถวเมื่อพื้นที่ไม่พอ
    const columns: FioriResponsiveColumn<MappingAttributeRow>[] = [
        {
            key: 'attribute',
            header: t('attributeColumn'),
            priority: 'always',
            minWidth: 220,
            render: (row) => (
                <div className={mappingStyles.stack}>
                    <span className={mappingStyles.primary}>{row.label}</span>
                    <span className={styles.code}>
                        {row.code} · {row.type}
                    </span>
                </div>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'medium',
            render: (row) => {
                const mapped = isMapped(row);
                const caption = statusCaption(row);
                return (
                    <div className={mappingStyles.stack}>
                        <Tag design={mapped ? 'Positive' : 'Neutral'} hideStateIcon>
                            {mapped ? t('statusMapped') : t('statusUnmapped')}
                        </Tag>
                        {mapped && caption && <span className={mappingStyles.caption}>{caption}</span>}
                    </div>
                );
            },
        },
        {
            key: 'mapTo',
            header: t('mapToColumn'),
            priority: 'high',
            minWidth: 260,
            render: (row) => renderMapToCell(row),
        },
        {
            key: 'sortOrder',
            header: t('sortOrder'),
            priority: 'low',
            align: 'right',
            width: 110,
            render: (row) =>
                isMapped(row) ? (
                    <Input
                        type="Number"
                        style={{ width: 90 }}
                        value={String(sortOrderFor(row))}
                        accessibleName={t('sortOrder')}
                        onInput={(e) => onSortOrderChange(row, Number(e.target.value) || 0)}
                    />
                ) : null,
        },
    ];

    const handleExport = (format: 'csv' | 'xlsx') => {
        // ส่ง search/status ตรงๆ แบบนี้เพราะตัวกรองของแท็บนี้เป็น state ฝั่ง
        // client ล้วนๆ (ดู useAttributeMapping) ปกติจะไม่ถูกส่งไปเซิร์ฟเวอร์เลย
        // ส่วน locale ก็ด้วยเหตุผลเดียวกับ AttributeController::export() —
        // ดูคอมเมนต์ที่นั่น
        const params = encodeQueryParams({ platform, format, search, status, locale });
        window.location.href = `/catalog/marketplace/attribute-mapping/export?${params.join('&')}`;
        setExportOpen(false);
    };

    return (
        <div>
            <div className={styles.header}>
                <span className={styles.helpText}>{t(helpTextKey)}</span>

                <div className={styles.headerActions}>
                    <Button ref={exportButtonRef} icon="download" endIcon="slim-arrow-down" onClick={() => setExportOpen((open) => !open)}>
                        {t('quickExport')}
                    </Button>
                    <Menu
                        open={exportOpen}
                        opener={exportButtonRef.current ?? undefined}
                        onClose={() => setExportOpen(false)}
                        onItemClick={(e) => handleExport((e.detail.item as HTMLElement).dataset.format as 'csv' | 'xlsx')}
                    >
                        <MenuItem text="CSV" data-format="csv" />
                        <MenuItem text="XLSX" data-format="xlsx" />
                    </Menu>

                    <MappingSyncButton busy={syncing} onClick={onSync}>
                        {t(syncLabelKey)}
                    </MappingSyncButton>

                    <Button design="Emphasized" disabled={pendingCount === 0 || saving} loading={saving} loadingDelay={0} onClick={onSave}>
                        {t('saveChanges')}
                        {pendingCount > 0 ? ` (${pendingCount})` : ''}
                    </Button>
                </div>
            </div>

            <MappingCoverageSummary payloadFields={coverage.payloadFields} platformAttributes={coverage.platformAttributes} />

            <div className={styles.filters}>
                <MappingSearchInput value={search} onChange={onSearchChange} placeholder={t('searchAttributes')} />

                <Select
                    className={styles.statusSelect}
                    value={status}
                    accessibleName={t('status')}
                    onChange={(e) => onStatusChange(e.detail.selectedOption.value as 'all' | 'mapped' | 'unmapped')}
                >
                    <Option value="all">{t('statusAll')}</Option>
                    <Option value="mapped">{t('statusMapped')}</Option>
                    <Option value="unmapped">{t('statusUnmapped')}</Option>
                </Select>
            </div>

            <FioriResponsiveTable
                columns={columns}
                rows={filtered}
                getRowKey={(row: MappingAttributeRow) => row.id}
                rowClassName={(row: MappingAttributeRow) => (hasPendingChange(row) ? mappingStyles.pendingRow : undefined)}
                emptyMessage={t('noAttributesFound')}
            />
        </div>
    );
}
