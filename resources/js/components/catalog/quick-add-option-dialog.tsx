import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { useLocale } from '@/hooks/use-locale';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Bar, BusyIndicator, Button, Dialog, FileUploader, FlexBox, Input, Label, Text, Title } from '@ui5/webcomponents-react';
import { KeyboardEvent, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

export interface ExistingOption {
    id: number;
    code?: string;
    admin_label?: string;
}

/**
 * ให้ผู้ใช้เพิ่ม option ใหม่ให้ attribute แบบ select/multiselect ได้โดยไม่ต้อง
 * ออกจากฟอร์มสินค้า — เปิดจาก field ของ attribute นั้นในหน้าแก้ไขสินค้า ยิง
 * ไปที่ endpoint แยกต่างหาก (attributes.options.quickAdd) ที่ใช้ controller
 * method เดียวกันกับหน้า CRUD options เต็มรูปแบบในหน้าแก้ไข attribute
 * (attribute-options-panel.tsx ยิงไป attributes.options.store) เพื่อให้
 * validation เหมือนกันเป๊ะๆ แต่ *สิทธิ์* แยกกัน — ตัวนี้กด attributes.
 * quick_add_options ต่างหาก ไม่ต้องมี attributes.edit_attributes เต็มรูปแบบ
 * (ซึ่งเปิดให้แก้ไขนิยามของ attribute เองด้วย) ก็เพิ่ม option ทีละตัวจากหน้า
 * สินค้าได้ ตัวนี้ยังเป็นแค่ทางเข้าแบบแคบๆ สำหรับเพิ่มทีละ option เท่านั้น
 *
 * เก็บ label แค่ของ locale ที่กำลังแก้อยู่ในหน้าสินค้าตอนนั้น (ไม่เก็บทุก
 * locale พร้อมกัน) — locale อื่นค่อยไปกรอกทีหลังจากหน้า options panel เต็ม
 * ส่วน `code` ไม่ได้เก็บเลย เพราะ backend จะ generate ให้เองเสมอ (ดูที่
 * CodeGenerator) ไม่สนใจค่าที่ส่งมาจาก client อยู่แล้ว ดังนั้นถ้าจะให้กรอกตรงนี้
 * ก็ไม่มีประโยชน์อะไร
 *
 * ถ้า `masterSourceLabel` ถูกส่งมา (attribute นี้ผูก master_source ไว้ — ดู
 * chip "Master: ..." ข้าง field) แสดงว่า option ที่กำลังจะสร้างจะไปเป็น
 * record ใหม่ในตาราง master นั้นจริงๆ ไม่ใช่ AttributeOption ตรงๆ (ดู
 * AttributeOptionController::storeMasterBackedOption()) — ซ่อนช่อง
 * swatch ไปเลยเพราะ master ที่รองรับ quick-add ไม่มีแนวคิด swatch ต่อตัวเลือก
 * (backend เพิกเฉยค่านี้อยู่แล้วถ้าส่งไป) และโชว์ข้อความเตือนสั้นๆ ให้รู้ว่า
 * กำลังจะสร้างที่ไหน ป้องกันความสับสนว่าทำไมกด "+" ตรงนี้แล้ว option ไปโผล่ที่
 * หน้า master แทนที่จะอยู่ใต้ attribute เฉยๆ
 */
export function QuickAddOptionDialog({
    open,
    attributeId,
    attributeLabel,
    activeLocaleCode,
    swatchType,
    existingOptions = [],
    masterSourceLabel,
    onClose,
    onCreated,
}: {
    open: boolean;
    attributeId: number;
    attributeLabel: string;
    activeLocaleCode?: string;
    swatchType?: string | null;
    existingOptions?: ExistingOption[];
    masterSourceLabel?: string;
    onClose: () => void;
    onCreated: (code: string) => void;
}) {
    const { t } = useTranslation('catalog');
    const { locales } = useLocale();
    const { props } = usePage<SharedData>();
    const activeLocale = locales.find((l) => l.code === activeLocaleCode) ?? locales[0];
    const [label, setLabel] = useState('');
    const [swatchText, setSwatchText] = useState('');
    const [swatchImage, setSwatchImage] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setLabel('');
        setSwatchText('');
        setSwatchImage(null);
        setError(null);
    };

    const handleClose = () => {
        if (processing) return;
        reset();
        onClose();
    };

    const submit = () => {
        if (!label.trim()) {
            setError(t('quickAddOptionLabelRequired'));
            return;
        }

        setProcessing(true);
        setError(null);

        router.post(
            `/catalog/attributes/${attributeId}/options/quick-add`,
            {
                translations: activeLocale ? { [String(activeLocale.id)]: label } : {},
                swatch_value: swatchType === 'color' ? swatchText : undefined,
                swatch_image: swatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                preserveState: true,
                forceFormData: true,
                onSuccess: (page) => {
                    const newCode = (page.props as { created_option_code?: string | null }).created_option_code ?? props.created_option_code;
                    if (newCode) onCreated(newCode);
                    reset();
                    onClose();
                },
                onError: (errors) => {
                    setError((Object.values(errors)[0] as string) ?? t('quickAddOptionGenericError'));
                },
                onFinish: () => setProcessing(false),
            },
        );
    };

    const submitOnEnter = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    };

    const idPrefix = useId();
    const labelInputId = `${idPrefix}-label`;
    const colorInputId = `${idPrefix}-color`;
    const imageInputId = `${idPrefix}-image`;

    // ลิสต์ดูอย่างเร็วนี้มีแค่ 2 คอลัมน์ (Code, Label) — โชว์ตลอดทั้งคู่เลย
    // ไม่มีอะไรต้องลดความสำคัญลง
    const existingOptionColumns: FioriResponsiveColumn<ExistingOption>[] = [
        {
            key: 'code',
            header: t('quickAddOptionCode'),
            priority: 'always',
            render: (option) => option.code,
        },
        {
            key: 'label',
            header: t('quickAddOptionLabelColumn'),
            priority: 'always',
            render: (option) => option.admin_label || '—',
        },
    ];

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            headerText={t('quickAddOptionTitle', { attribute: attributeLabel })}
            initialFocus={labelInputId}
            style={{ width: '37.5rem', maxWidth: '100%' }}
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button design="Emphasized" onClick={submit} disabled={processing || !label.trim()}>
                                {processing && <BusyIndicator active size="S" style={{ marginInlineEnd: '0.375rem', verticalAlign: 'middle' }} />}
                                {processing ? t('quickAddOptionAdding') : t('quickAddOptionAdd')}
                            </Button>
                            <Button design="Transparent" onClick={handleClose} disabled={processing}>
                                {t('quickAddOptionCancel')}
                            </Button>
                        </>
                    }
                />
            }
        >
            {masterSourceLabel && (
                <FioriMessageStrip severity="information" style={{ marginBottom: '1rem' }}>
                    <Trans t={t} i18nKey="quickAddOptionMasterNotice" values={{ source: masterSourceLabel }} components={{ strong: <strong /> }} />
                </FioriMessageStrip>
            )}

            {existingOptions.length > 0 && (
                <>
                    <Title level="H6" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                        {t('quickAddOptionExistingOptions', { count: existingOptions.length })}
                    </Title>
                    <div
                        style={{
                            maxHeight: 220,
                            marginBottom: '1rem',
                            overflowY: 'auto',
                            border: '1px solid var(--sapGroup_ContentBorderColor)',
                            borderRadius: 'var(--sapElement_BorderCornerRadius)',
                        }}
                    >
                        <FioriResponsiveTable
                            variant="plain"
                            size="small"
                            columns={existingOptionColumns}
                            rows={existingOptions}
                            getRowKey={(option) => option.id}
                        />
                    </div>
                </>
            )}

            <Title level="H6" style={{ marginBottom: '0.5rem' }}>
                {t('quickAddOptionNewOptionTitle')}
            </Title>
            <FlexBox wrap="Wrap" alignItems="End" style={{ gap: '1rem', marginTop: '0.5rem' }}>
                <FlexBox direction="Column" style={{ gap: '0.25rem', minWidth: 220, flex: 1 }}>
                    <Label for={labelInputId} showColon={false}>
                        {t('quickAddOptionLabelField', { locale: activeLocale?.display_name ?? activeLocale?.code ?? 'default' })}
                    </Label>
                    <Input
                        id={labelInputId}
                        value={label}
                        onInput={(e) => setLabel(e.target.value)}
                        onKeyDown={submitOnEnter}
                        valueState={error ? 'Negative' : 'None'}
                        style={{ width: '100%' }}
                    />
                </FlexBox>
                {!masterSourceLabel && swatchType === 'color' && (
                    <FlexBox direction="Column" style={{ gap: '0.25rem', width: 140 }}>
                        <Label for={colorInputId} showColon={false}>
                            {t('quickAddOptionColorHex')}
                        </Label>
                        <Input
                            id={colorInputId}
                            value={swatchText}
                            onInput={(e) => setSwatchText(e.target.value)}
                            onKeyDown={submitOnEnter}
                            style={{ width: '100%' }}
                        />
                    </FlexBox>
                )}
                {!masterSourceLabel && swatchType === 'image' && (
                    <FileUploader
                        id={imageInputId}
                        accept="image/*"
                        onChange={(e) => setSwatchImage(e.detail.files?.[0] ?? null)}
                        style={{ width: 220 }}
                    />
                )}
            </FlexBox>
            {error && (
                <Text style={{ display: 'block', marginTop: '0.5rem', fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapNegativeTextColor)' }}>
                    {error}
                </Text>
            )}
        </Dialog>
    );
}
