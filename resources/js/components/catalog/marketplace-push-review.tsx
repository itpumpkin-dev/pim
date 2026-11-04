import { FioriMessageStrip } from '@/components/fiori-form';
import { BusyIndicator, Title } from '@ui5/webcomponents-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * เนื้อหา "ตรวจสอบข้อมูลก่อนส่งไป {platform}" ของหน้าแก้ไขสินค้า — ใช้ข้อมูลจาก
 * endpoint เดียวกับ dialog ในหน้า marketplace (Lazada/Shopee/TikTok
 * AttributeMappingController::productDetail()) แต่ต่างกันตรงที่ที่นี่ "บล็อก"
 * การ push จริงถ้ามีเงื่อนไขไหนไม่ผ่าน (หน้า marketplace แค่เตือน) — ผลการตรวจ
 * ส่งกลับให้ผู้เรียกผ่าน onReadyChange เพื่อ disable ปุ่ม Push
 *
 * WooCommerce ไม่มี endpoint นี้ — ผู้เรียกไม่ต้อง render component นี้สำหรับ
 * WooCommerce (ดู REVIEWABLE_PLATFORMS)
 */

export const REVIEWABLE_PLATFORMS = ['lazada', 'shopee', 'tiktok'] as const;
export type ReviewablePlatform = (typeof REVIEWABLE_PLATFORMS)[number];

// group.platform ในหน้าแก้ไขสินค้าอาจเป็นตัวพิมพ์ใหญ่ ("Lazada") — เทียบแบบ lowercase
export function isReviewablePlatform(platform: string): boolean {
    return (REVIEWABLE_PLATFORMS as readonly string[]).includes(platform.toLowerCase());
}

type FieldRow = { label: string; value: string | number | null; type?: string | null; mandatory?: boolean };

type ProductDetail = {
    attributes: FieldRow[];
    platform_fields: FieldRow[];
    platform_images: string[];
    lazada_category_path?: string | null;
    shopee_category_path?: string | null;
    tiktok_category_path?: string | null;
};

// รายละเอียดสินค้ามาจาก RichTextEditor (HTML) — โชว์/เช็คเป็นข้อความล้วน
const plainText = (value: FieldRow['value']) =>
    value === null || value === undefined
        ? ''
        : String(value)
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

// "0" (สต็อก 0) ถือว่ากรอกแล้ว — ว่างคือ null/สตริงว่าง/HTML ที่ไม่มีข้อความเท่านั้น
const isEmpty = (value: FieldRow['value']) => plainText(value) === '';

// วิดีโอเป็นตัวเลือกเสริมของทุก marketplace — ไม่บังคับ
const isRequiredPlatformField = (field: FieldRow) => field.type !== 'video';

export function MarketplacePushReview({
    productId,
    platform,
    onReadyChange,
    showSavedDataNote = true,
}: {
    productId: number;
    platform: ReviewablePlatform;
    onReadyChange: (ready: boolean) => void;
    /** "บันทึกและเผยแพร่" ตรวจหลังบันทึกเสร็จแล้ว — ไม่ต้องเตือนให้บันทึกก่อน */
    showSavedDataNote?: boolean;
}) {
    const { t } = useTranslation('catalog');
    const [detail, setDetail] = useState<ProductDetail | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setDetail(null);
        setError(null);
        onReadyChange(false);

        fetch(`/catalog/marketplace/${platform}/products/${productId}/detail`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();
                if (cancelled) return;
                if (!res.ok) {
                    setError(body.message ?? t('pushReviewLoadFailed'));
                    return;
                }
                setDetail(body);
            })
            .catch(() => {
                if (!cancelled) setError(t('pushReviewLoadFailed'));
            });

        return () => {
            cancelled = true;
        };
        // onReadyChange/t ตั้งใจไม่ใส่ — โหลดใหม่เฉพาะตอนเปลี่ยนสินค้า/แพลตฟอร์ม
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productId, platform]);

    const categoryPath = detail ? (detail[`${platform}_category_path`] ?? null) : null;
    const missingAttributes = detail ? detail.attributes.filter((a) => a.mandatory && isEmpty(a.value)) : [];
    const missingFields = detail ? detail.platform_fields.filter((f) => isRequiredPlatformField(f) && isEmpty(f.value)) : [];
    const noImages = detail ? detail.platform_images.length === 0 : false;

    const issues: string[] = [];
    if (detail) {
        if (!categoryPath) issues.push(t('pushReviewNoCategory', { platform: platformLabel(platform) }));
        if (missingAttributes.length > 0) {
            issues.push(
                t('pushReviewMissingAttributes', { count: missingAttributes.length, list: missingAttributes.map((a) => a.label).join(', ') }),
            );
        }
        if (missingFields.length > 0) {
            issues.push(t('pushReviewMissingFields', { count: missingFields.length, list: missingFields.map((f) => f.label).join(', ') }));
        }
        if (noImages) issues.push(t('pushReviewNoImages'));
    }

    const ready = detail !== null && issues.length === 0;
    useEffect(() => {
        onReadyChange(ready);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);

    if (error) {
        return (
            <FioriMessageStrip severity="error" style={{ padding: '0.25rem 0' }}>
                {error}
            </FioriMessageStrip>
        );
    }

    if (!detail) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BusyIndicator active delay={0} size="S" />
                <span style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapContent_LabelColor)' }}>{t('pushReviewLoading')}</span>
            </div>
        );
    }

    return (
        <div>
            {issues.length > 0 ? (
                <FioriMessageStrip severity="error" style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{t('pushReviewBlockedTitle')}</div>
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                        {issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                        ))}
                    </ul>
                </FioriMessageStrip>
            ) : (
                <FioriMessageStrip severity="success" style={{ marginBottom: '1rem' }}>
                    {t('pushReviewAllPassed')}
                </FioriMessageStrip>
            )}

            {showSavedDataNote && (
                <span style={{ display: 'block', marginBottom: '1rem', fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>
                    {t('pushReviewSavedDataNote')}
                </span>
            )}

            <SectionTitle>{t('pushReviewCategory')}</SectionTitle>
            <div
                style={{
                    marginBottom: '1rem',
                    fontSize: 'var(--sapFontSize)',
                    color: categoryPath ? 'var(--sapTextColor)' : 'var(--sapNegativeTextColor)',
                    fontWeight: categoryPath ? 400 : 600,
                }}
            >
                {categoryPath ?? t('pushReviewNotMapped')}
            </div>

            <SectionTitle>{t('pushReviewPlatformFields')}</SectionTitle>
            <FieldList rows={detail.platform_fields} isRequired={isRequiredPlatformField} />

            <SectionTitle>{t('pushReviewImages', { count: detail.platform_images.length })}</SectionTitle>
            {noImages ? (
                <div style={{ marginBottom: '1rem', fontSize: 'var(--sapFontSize)', color: 'var(--sapNegativeTextColor)', fontWeight: 600 }}>
                    {t('pushReviewNoImagesShort')}
                </div>
            ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                    {detail.platform_images.map((url, idx) => (
                        <img
                            key={idx}
                            src={url}
                            alt={`${idx + 1}`}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.visibility = 'hidden';
                            }}
                            style={{
                                width: 64,
                                height: 64,
                                borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                objectFit: 'cover',
                                border: '1px solid var(--sapGroup_ContentBorderColor)',
                                background: 'var(--sapList_HeaderBackground)',
                            }}
                        />
                    ))}
                </div>
            )}

            <SectionTitle>{t('pushReviewAttributes')}</SectionTitle>
            <FieldList rows={detail.attributes} isRequired={(row) => Boolean(row.mandatory)} showRequiredTag />
        </div>
    );
}

function platformLabel(platform: ReviewablePlatform): string {
    return { lazada: 'Lazada', shopee: 'Shopee', tiktok: 'TikTok' }[platform];
}

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <Title level="H6" size="H6" wrappingType="Normal" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {children}
        </Title>
    );
}

function FieldList({
    rows,
    isRequired,
    showRequiredTag = false,
}: {
    rows: FieldRow[];
    isRequired: (row: FieldRow) => boolean;
    showRequiredTag?: boolean;
}) {
    const { t } = useTranslation('catalog');

    return (
        <div style={{ marginBottom: '1rem' }}>
            {rows.map((row, idx) => {
                const empty = isEmpty(row.value);
                const blocking = empty && isRequired(row);

                return (
                    <div
                        key={idx}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '1rem',
                            padding: '0.375rem 0',
                            borderTop: idx > 0 ? '1px solid var(--sapGroup_ContentBorderColor)' : undefined,
                        }}
                    >
                        <div style={{ flexShrink: 0 }}>
                            <div style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapTextColor)' }}>
                                {row.label}{' '}
                                {showRequiredTag && row.mandatory && (
                                    <span style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapCriticalTextColor)', fontWeight: 700 }}>
                                        {t('pushReviewRequired')}
                                    </span>
                                )}
                            </div>
                            {row.type && (
                                <span style={{ display: 'block', fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>
                                    {row.type}
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                fontSize: 'var(--sapFontSize)',
                                color: blocking ? 'var(--sapNegativeTextColor)' : empty ? 'var(--sapContent_LabelColor)' : 'var(--sapTextColor)',
                                fontWeight: blocking ? 600 : 400,
                                textAlign: 'right',
                                wordBreak: 'break-word',
                                maxHeight: 96,
                                overflow: 'hidden',
                            }}
                        >
                            {empty ? t('pushReviewEmpty') : plainText(row.value)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
