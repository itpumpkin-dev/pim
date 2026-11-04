import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriBusyOverlay } from '@/lib/fiori-style';
import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/broken-link.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/popup-window.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/switch-views.js';
import '@ui5/webcomponents-icons/dist/sys-first-page.js';
import '@ui5/webcomponents-icons/dist/sys-last-page.js';
import { Button, ComboBox, ComboBoxItem, FlexBox, Icon, Input, Option, Select, Text } from '@ui5/webcomponents-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FamilyOption {
    id: number;
    code: string;
    name?: string;
}

interface DefaultAssignmentRow {
    family_id: number;
    family_code: string;
    family_name: string | null;
    group_id: number;
    group_name: string | null;
    subcategory_name: string | null;
    category_name: string | null;
}

interface DefaultAssignmentResponse {
    data: DefaultAssignmentRow[];
    current_page: number;
    last_page: number;
    total: number;
}

interface Props {
    families: FamilyOption[];
    canEdit: boolean;
    canAssignDefault: boolean;
    canEditProductGroup: boolean;
}

const familyLabel = (f: { code: string; name?: string | null }) => (f.name ? `${f.name} (${f.code})` : f.code);

/**
 * แท็บ "จัดการ" บนหน้า index ตระกูลแอตทริบิวต์ — ตารางว่าตอนนี้แต่ละกลุ่มสินค้า
 * ใช้ตระกูลไหนเป็นค่าเริ่มต้นอยู่ (ดู AttributeFamilyController::defaultAssignments())
 * พร้อมปุ่มเปลี่ยน/ถอดตระกูลทีละกลุ่ม ซึ่งยิงไปที่ endpoint set/unset-default-for-groups
 * ตัวเดียวกับ dialog บนหน้าแก้ไขตระกูล แค่ส่ง category_ids ไปกลุ่มเดียว
 */
export function ManageDefaultsTab({ families, canEdit, canAssignDefault, canEditProductGroup }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [familyFilter, setFamilyFilter] = useState<FamilyOption | null>(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [data, setData] = useState<DefaultAssignmentResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [changeRow, setChangeRow] = useState<DefaultAssignmentRow | null>(null);
    const [changeTarget, setChangeTarget] = useState<FamilyOption | null>(null);
    const [unassignRow, setUnassignRow] = useState<DefaultAssignmentRow | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (familyFilter) params.set('family_id', String(familyFilter.id));

        setLoading(true);
        fetch(`/catalog/attributeFamilies/default-assignments?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: DefaultAssignmentResponse | null) => {
                if (json) setData(json);
            })
            .catch(() => undefined)
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [page, perPage, debouncedSearch, familyFilter, reloadKey]);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    const submit = (url: string, groupId: number, onDone: () => void) => {
        setSubmitting(true);
        router.post(
            url,
            { category_ids: [groupId] },
            {
                preserveState: true,
                preserveScroll: true,
                onSuccess: () => {
                    onDone();
                    reload();
                },
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const currentPage = data?.current_page ?? 1;
    const lastPage = data?.last_page ?? 1;
    const initialLoading = loading && !data;

    const columns: FioriResponsiveColumn<DefaultAssignmentRow>[] = [
        { key: 'id', header: t('fields.id'), priority: 'low', render: (row) => row.family_id },
        { key: 'code', header: t('fields.code'), priority: 'always', render: (row) => <span style={{ fontWeight: 500 }}>{row.family_code}</span> },
        { key: 'name', header: t('fields.name'), priority: 'high', render: (row) => row.family_name || row.family_code },
        {
            key: 'group',
            header: tCatalog('manageDefaultsProductGroup'),
            priority: 'always',
            render: (row) => (
                <div>
                    <div style={{ fontWeight: 500, color: 'var(--sapTextColor)', fontSize: 'var(--sapFontSize)' }}>{row.group_name}</div>
                    {(row.category_name || row.subcategory_name) && (
                        <div style={{ color: 'var(--sapContent_LabelColor)', fontSize: 'var(--sapFontSmallSize)' }}>
                            {[row.category_name, row.subcategory_name].filter(Boolean).join(' › ')}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <FlexBox justifyContent="End" style={{ gap: '0.25rem' }}>
                    {canEdit && (
                        <Button
                            design="Transparent"
                            icon="edit"
                            tooltip={tCatalog('manageDefaultsEditFamily')}
                            accessibleName={tCatalog('manageDefaultsEditFamily')}
                            onClick={() => router.visit(`/catalog/attributeFamilies/${row.family_id}/edit`)}
                        />
                    )}
                    {canEditProductGroup && (
                        <Button
                            design="Transparent"
                            icon="popup-window"
                            tooltip={tCatalog('manageDefaultsOpenProductGroup')}
                            accessibleName={tCatalog('manageDefaultsOpenProductGroup')}
                            onClick={() => router.visit(`/catalog/product-groups/${row.group_id}/edit`)}
                        />
                    )}
                    {canAssignDefault && (
                        <Button
                            design="Transparent"
                            icon="switch-views"
                            tooltip={tCatalog('manageDefaultsChange')}
                            accessibleName={tCatalog('manageDefaultsChange')}
                            onClick={() => {
                                setChangeRow(row);
                                setChangeTarget(null);
                            }}
                        />
                    )}
                    {canAssignDefault && (
                        <Button
                            design="Transparent"
                            icon="broken-link"
                            tooltip={tCatalog('manageDefaultsUnassign')}
                            accessibleName={tCatalog('manageDefaultsUnassign')}
                            onClick={() => setUnassignRow(row)}
                        />
                    )}
                </FlexBox>
            ),
        },
    ];

    const changeOptions = changeRow ? families.filter((f) => f.id !== changeRow.family_id) : [];

    return (
        <>
            <div
                style={{
                    background: 'var(--sapGroup_ContentBackground)',
                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                    overflow: 'hidden',
                }}
            >
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', padding: '1rem' }}>
                    <FlexBox alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem' }}>
                        <Input
                            value={search}
                            onInput={(event) => setSearch(event.target.value)}
                            placeholder={tCatalog('manageDefaultsSearch')}
                            icon={<Icon name="search" />}
                            style={{ minWidth: 260 }}
                        />
                        <ComboBox
                            placeholder={tCatalog('manageDefaultsAllFamilies')}
                            showClearIcon
                            selectedValue={familyFilter ? String(familyFilter.id) : undefined}
                            value={familyFilter ? familyLabel(familyFilter) : ''}
                            onInput={(e) => {
                                // ช่องถูกล้าง (ปุ่ม clear หรือลบจนว่าง) = กลับไปแสดงทุกตระกูล
                                if ((e.target.value ?? '') === '' && familyFilter) {
                                    setFamilyFilter(null);
                                    setPage(1);
                                }
                            }}
                            onSelectionChange={(e) => {
                                const id = e.detail.item?.value;
                                const next = id ? (families.find((f) => String(f.id) === id) ?? null) : null;
                                setFamilyFilter(next);
                                setPage(1);
                            }}
                            style={{ minWidth: 260 }}
                        >
                            {families.map((f) => (
                                <ComboBoxItem key={f.id} value={String(f.id)} text={familyLabel(f)} />
                            ))}
                        </ComboBox>
                    </FlexBox>

                    <FlexBox alignItems="Center" wrap="Wrap" style={{ gap: '0.75rem', rowGap: '0.5rem' }}>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('results', { count: data?.total ?? 0 })}</Text>
                        <Select
                            value={String(perPage)}
                            onChange={(e) => {
                                setPerPage(Number(e.detail.selectedOption.value));
                                setPage(1);
                            }}
                            style={{ width: '5rem' }}
                        >
                            <Option value="10">10</Option>
                            <Option value="15">15</Option>
                            <Option value="25">25</Option>
                            <Option value="50">50</Option>
                        </Select>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('perPage')}</Text>
                        <Text>{currentPage}</Text>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('pageOf', { lastPage })}</Text>
                        <FlexBox style={{ gap: '0.125rem' }}>
                            <Button design="Transparent" icon="sys-first-page" disabled={currentPage <= 1} onClick={() => setPage(1)} />
                            <Button
                                design="Transparent"
                                icon="slim-arrow-left"
                                disabled={currentPage <= 1}
                                onClick={() => setPage(currentPage - 1)}
                            />
                            <Button
                                design="Transparent"
                                icon="slim-arrow-right"
                                disabled={currentPage >= lastPage}
                                onClick={() => setPage(currentPage + 1)}
                            />
                            <Button design="Transparent" icon="sys-last-page" disabled={currentPage >= lastPage} onClick={() => setPage(lastPage)} />
                        </FlexBox>
                    </FlexBox>
                </FlexBox>

                <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)' }} />

                {/* โชว์ indicator ทันทีทุกครั้งที่โหลด (ไม่รอ delay) ให้รู้ว่ากำลังดึงข้อมูล
                    และกันความสูงไว้ตอนยังไม่มีแถว ไม่งั้น spinner จะเบียดอยู่ในพื้นที่แคบๆ */}
                <FioriBusyOverlay busy={loading} delayMs={0}>
                    {initialLoading && <div style={{ minHeight: 160 }} />}
                    {!initialLoading && (
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={data?.data ?? []}
                            getRowKey={(row) => `${row.group_id}-${row.family_id}`}
                            emptyMessage={tCatalog('manageDefaultsEmpty')}
                        />
                    )}
                </FioriBusyOverlay>
            </div>

            {/* เปลี่ยนตระกูลเริ่มต้นของกลุ่มสินค้านี้ */}
            <FioriMessageBox
                open={changeRow !== null}
                onCancel={() => setChangeRow(null)}
                onConfirm={() => {
                    if (changeRow && changeTarget) {
                        submit(`/catalog/attributeFamilies/${changeTarget.id}/set-default-for-groups`, changeRow.group_id, () => setChangeRow(null));
                    }
                }}
                title={tCatalog('manageDefaultsChangeTitle')}
                severity="confirm"
                confirmLabel={tCatalog('manageDefaultsChange')}
                cancelLabel={t('cancel')}
                confirmLoading={submitting}
                confirmDisabled={!changeTarget || changeTarget.id === changeRow?.family_id}
            >
                {changeRow && (
                    <FlexBox direction="Column" style={{ gap: '0.75rem', minWidth: 'min(400px, 100%)' }}>
                        <Text>
                            {tCatalog('manageDefaultsChangeMessage', {
                                group: changeRow.group_name,
                                family: familyLabel({ code: changeRow.family_code, name: changeRow.family_name }),
                            })}
                        </Text>
                        <ComboBox
                            placeholder={tCatalog('manageDefaultsPickFamily')}
                            showClearIcon
                            selectedValue={changeTarget ? String(changeTarget.id) : undefined}
                            value={changeTarget ? familyLabel(changeTarget) : ''}
                            onInput={(e) => {
                                if ((e.target.value ?? '') === '' && changeTarget) setChangeTarget(null);
                            }}
                            onSelectionChange={(e) => {
                                const id = e.detail.item?.value;
                                setChangeTarget(id ? (changeOptions.find((f) => String(f.id) === id) ?? null) : null);
                            }}
                            style={{ width: '100%' }}
                        >
                            {changeOptions.map((f) => (
                                <ComboBoxItem key={f.id} value={String(f.id)} text={familyLabel(f)} />
                            ))}
                        </ComboBox>
                    </FlexBox>
                )}
            </FioriMessageBox>

            {/* ถอดตระกูลออกจากกลุ่มสินค้านี้ */}
            <FioriMessageBox
                open={unassignRow !== null}
                onCancel={() => setUnassignRow(null)}
                onConfirm={() => {
                    if (unassignRow) {
                        submit(`/catalog/attributeFamilies/${unassignRow.family_id}/unset-default-for-groups`, unassignRow.group_id, () =>
                            setUnassignRow(null),
                        );
                    }
                }}
                title={tCatalog('manageDefaultsUnassign')}
                severity="warning"
                destructive
                confirmLabel={tCatalog('manageDefaultsUnassign')}
                cancelLabel={t('cancel')}
                confirmLoading={submitting}
            >
                {unassignRow &&
                    tCatalog('manageDefaultsUnassignMessage', {
                        group: unassignRow.group_name,
                        family: familyLabel({ code: unassignRow.family_code, name: unassignRow.family_name }),
                    })}
            </FioriMessageBox>
        </>
    );
}
