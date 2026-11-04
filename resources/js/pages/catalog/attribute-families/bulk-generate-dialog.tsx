import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Bar, BusyIndicator, Button, CheckBox, Dialog, Icon, Input, Label, Option, Select, Tag, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './bulk-generate-dialog.module.css';

interface ProductGroupPickerItem {
    id: number;
    name: string;
    subcategory_name: string | null;
    category_name: string | null;
}

interface ProductGroupPickerResponse {
    data: ProductGroupPickerItem[];
    current_page: number;
    last_page: number;
    total: number;
}

interface OtherFamily {
    id: number;
    code: string;
    name?: string;
}

/**
 * "สร้างตามกลุ่มสินค้า" — bulk-creates one Attribute Family per selected
 * Product Group, named from $namePattern (the literal token "{name}" is
 * replaced with the group's own name), optionally cloning another family's
 * groups/attributes into every one created. Mirrors the "assign default
 * family to selected Product Groups" picker on edit.tsx (same search/page/
 * checkbox-list shape) — but lists every Product Group regardless of
 * whether it already has a family: the new one is appended after whatever
 * it already has (see AttributeFamilyBulkGenerator), never replacing its
 * existing default.
 */
export function BulkGenerateDialog({ open, onClose, otherFamilies }: { open: boolean; onClose: () => void; otherFamilies: OtherFamily[] }) {
    const { t } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pickerData, setPickerData] = useState<ProductGroupPickerResponse | null>(null);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [namePattern, setNamePattern] = useState('สเปค-{name}');
    const [templateFamilyId, setTemplateFamilyId] = useState<number | ''>('');
    const [submitting, setSubmitting] = useState(false);
    const [selectAllLoading, setSelectAllLoading] = useState(false);

    useEffect(() => {
        if (!open) return undefined;

        setPickerLoading(true);
        const params = new URLSearchParams({ page: String(page), per_page: '15' });
        if (search.trim()) params.set('search', search.trim());

        const controller = new AbortController();
        fetch(`/catalog/attributeFamilies/product-groups-for-bulk-generate?${params}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => res.json())
            .then((json: ProductGroupPickerResponse) => setPickerData(json))
            .catch((err) => {
                if (err.name !== 'AbortError') setPickerData(null);
            })
            .finally(() => setPickerLoading(false));

        return () => controller.abort();
    }, [open, search, page]);

    // ค้นหาใหม่ -> กลับไปหน้า 1 เสมอ (หน้าเดิมอาจไม่มีอยู่แล้วในผลลัพธ์ใหม่)
    useEffect(() => {
        setPage(1);
    }, [search]);

    const toggleSelected = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // ดึง id ของกลุ่มสินค้าที่ตรงกับคำค้นปัจจุบัน "ทุกหน้า" มาเลือกทีเดียว — ไม่
    // ทับตัวที่เลือกไว้ก่อนหน้าจากคำค้นอื่น (union เข้าไป เหมือนติ๊กทีละแถว)
    const selectAllMatching = () => {
        if (selectAllLoading) return;

        setSelectAllLoading(true);
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());

        fetch(`/catalog/attributeFamilies/product-groups-for-bulk-generate/ids?${params}`, { headers: { Accept: 'application/json' } })
            .then((res) => res.json())
            .then((json: { ids: number[] }) => {
                setSelectedIds((prev) => new Set([...prev, ...json.ids]));
            })
            .finally(() => setSelectAllLoading(false));
    };

    const clearSelection = () => setSelectedIds(new Set());

    const reset = () => {
        setSearch('');
        setPage(1);
        setPickerData(null);
        setSelectedIds(new Set());
        setNamePattern('สเปค-{name}');
        setTemplateFamilyId('');
    };

    const handleClose = () => {
        onClose();
        reset();
    };

    const previewNames = useMemo(() => {
        if (!pickerData) return [];
        return pickerData.data
            .filter((g) => selectedIds.has(g.id))
            .slice(0, 3)
            .map((g) => namePattern.replace('{name}', g.name));
    }, [pickerData, selectedIds, namePattern]);

    const canSubmit = selectedIds.size > 0 && namePattern.includes('{name}') && !submitting;

    const handleSubmit = () => {
        if (!canSubmit) return;

        setSubmitting(true);
        router.post(
            '/catalog/attributeFamilies/bulk-generate',
            {
                category_ids: Array.from(selectedIds),
                name_pattern: namePattern,
                template_family_id: templateFamilyId === '' ? null : templateFamilyId,
            },
            {
                preserveScroll: true,
                onSuccess: () => handleClose(),
                onFinish: () => setSubmitting(false),
            },
        );
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            className={styles.dialog}
            header={
                <Bar
                    startContent={<Title level="H5">{t('generateFromProductGroupsDialogTitle')}</Title>}
                    endContent={<Button design="Transparent" icon="decline" tooltip={t('close')} accessibleName={t('close')} onClick={handleClose} />}
                />
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button design="Transparent" onClick={handleClose}>
                                {t('cancel')}
                            </Button>
                            <Button design="Emphasized" disabled={!canSubmit} loading={submitting} onClick={handleSubmit}>
                                {t('bulkGenerateSubmit')}
                            </Button>
                        </>
                    }
                />
            }
        >
            <div className={styles.top}>
                <Text className={styles.help}>{t('generateFromProductGroupsHelp')}</Text>

                <Label for="bulk-generate-name-pattern" showColon={false}>
                    {t('namePatternLabel')}
                </Label>
                <Input
                    id="bulk-generate-name-pattern"
                    style={{ width: '100%' }}
                    value={namePattern}
                    onInput={(e) => setNamePattern(e.target.value)}
                />
                <span className={styles.fieldHelp}>{t('namePatternHelp')}</span>

                <Label for="bulk-generate-template" showColon={false}>
                    {t('startFromTemplateLabel')}
                </Label>
                <Select
                    id="bulk-generate-template"
                    style={{ width: '100%', marginBottom: '1rem' }}
                    value={templateFamilyId === '' ? '' : String(templateFamilyId)}
                    onChange={(e) => {
                        const v = e.detail.selectedOption.value ?? '';
                        setTemplateFamilyId(v === '' ? '' : Number(v));
                    }}
                >
                    <Option value="">{t('startFromTemplateEmpty')}</Option>
                    {otherFamilies.map((f) => (
                        <Option key={f.id} value={String(f.id)}>
                            {f.name || f.code} ({f.code})
                        </Option>
                    ))}
                </Select>

                {previewNames.length > 0 && (
                    <div className={styles.chips}>
                        {previewNames.map((name) => (
                            <Tag key={name} design="Information" hideStateIcon>
                                {name}
                            </Tag>
                        ))}
                        {selectedIds.size > previewNames.length && (
                            <Tag design="Neutral" hideStateIcon>
                                {`+${selectedIds.size - previewNames.length}`}
                            </Tag>
                        )}
                    </div>
                )}

                <Input
                    style={{ width: '100%' }}
                    value={search}
                    onInput={(e) => setSearch(e.target.value)}
                    placeholder={t('search')}
                    icon={<Icon name="search" />}
                />

                <div className={styles.selectionActions}>
                    <Button
                        design="Transparent"
                        onClick={selectAllMatching}
                        loading={selectAllLoading}
                        disabled={selectAllLoading || !pickerData || pickerData.total === 0}
                    >
                        {t('selectAllMatching', { count: pickerData?.total ?? 0 })}
                    </Button>
                    {selectedIds.size > 0 && (
                        <Button design="Transparent" onClick={clearSelection} style={{ color: 'var(--sapContent_LabelColor)' }}>
                            {t('clearSelection')}
                        </Button>
                    )}
                </div>

                {selectedIds.size > 0 && <span className={styles.selectedCount}>{t('selectedGroupsCount', { count: selectedIds.size })}</span>}
            </div>

            <div className={styles.listArea}>
                {pickerLoading ? (
                    <div className={styles.empty}>
                        <BusyIndicator active size="M" />
                    </div>
                ) : !pickerData || pickerData.data.length === 0 ? (
                    <div className={styles.empty}>{t('noProductGroupsFound')}</div>
                ) : (
                    pickerData.data.map((group) => (
                        <div
                            key={group.id}
                            className={styles.row}
                            role="checkbox"
                            aria-checked={selectedIds.has(group.id)}
                            onClick={() => toggleSelected(group.id)}
                        >
                            <CheckBox className={styles.rowCheck} checked={selectedIds.has(group.id)} tabIndex={-1} />
                            <span>
                                <span className={styles.rowName}>{group.name}</span>
                                <span className={styles.rowSub}>{[group.category_name, group.subcategory_name].filter(Boolean).join(' / ')}</span>
                            </span>
                        </div>
                    ))
                )}
            </div>

            {pickerData && pickerData.last_page > 1 && (
                <div className={styles.pager}>
                    <Button design="Transparent" icon="slim-arrow-left" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
                    <span>
                        {pickerData.current_page} / {pickerData.last_page}
                    </span>
                    <Button
                        design="Transparent"
                        icon="slim-arrow-right"
                        disabled={page >= pickerData.last_page}
                        onClick={() => setPage((p) => p + 1)}
                    />
                </div>
            )}
        </Dialog>
    );
}
