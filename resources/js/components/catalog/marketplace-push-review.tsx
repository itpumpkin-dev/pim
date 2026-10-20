import { FioriMessageStrip } from '@/components/fiori-form';
import { FIORI } from '@/lib/fiori-style';
import { Box, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
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
            <FioriMessageStrip severity="error" sx={{ py: 0.5 }}>
                {error}
            </FioriMessageStrip>
        );
    }

    if (!detail) {
        return (
            <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">
                    {t('pushReviewLoading')}
                </Typography>
            </Stack>
        );
    }

    return (
        <Box>
            {issues.length > 0 ? (
                <FioriMessageStrip severity="error" sx={{ mb: 2 }}>
                    <Typography variant="body2" fontWeight={600}>
                        {t('pushReviewBlockedTitle')}
                    </Typography>
                    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                        {issues.map((issue) => (
                            <Typography key={issue} component="li" variant="body2">
                                {issue}
                            </Typography>
                        ))}
                    </Box>
                </FioriMessageStrip>
            ) : (
                <FioriMessageStrip severity="success" sx={{ mb: 2 }}>
                    {t('pushReviewAllPassed')}
                </FioriMessageStrip>
            )}

            {showSavedDataNote && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    {t('pushReviewSavedDataNote')}
                </Typography>
            )}

            <SectionTitle>{t('pushReviewCategory')}</SectionTitle>
            <Typography variant="body2" sx={{ mb: 2, color: categoryPath ? FIORI.textPrimary : FIORI.error, fontWeight: categoryPath ? 400 : 600 }}>
                {categoryPath ?? t('pushReviewNotMapped')}
            </Typography>

            <SectionTitle>{t('pushReviewPlatformFields')}</SectionTitle>
            <FieldList rows={detail.platform_fields} isRequired={isRequiredPlatformField} />

            <SectionTitle>{t('pushReviewImages', { count: detail.platform_images.length })}</SectionTitle>
            {noImages ? (
                <Typography variant="body2" sx={{ color: FIORI.error, fontWeight: 600, mb: 2 }}>
                    {t('pushReviewNoImagesShort')}
                </Typography>
            ) : (
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                    {detail.platform_images.map((url, idx) => (
                        <Box
                            key={idx}
                            component="img"
                            src={url}
                            alt={`${idx + 1}`}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.visibility = 'hidden';
                            }}
                            sx={{
                                width: 64,
                                height: 64,
                                borderRadius: 1,
                                objectFit: 'cover',
                                border: `1px solid ${FIORI.border}`,
                                bgcolor: FIORI.headerBg,
                            }}
                        />
                    ))}
                </Stack>
            )}

            <SectionTitle>{t('pushReviewAttributes')}</SectionTitle>
            <FieldList rows={detail.attributes} isRequired={(row) => Boolean(row.mandatory)} showRequiredTag />
        </Box>
    );
}

function platformLabel(platform: ReviewablePlatform): string {
    return { lazada: 'Lazada', shopee: 'Shopee', tiktok: 'TikTok' }[platform];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 1 }}>
            {children}
        </Typography>
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
        <Stack divider={<Divider sx={{ borderColor: FIORI.border }} />} spacing={0} sx={{ mb: 2 }}>
            {rows.map((row, idx) => {
                const empty = isEmpty(row.value);
                const blocking = empty && isRequired(row);

                return (
                    <Stack key={idx} direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ py: 0.75 }}>
                        <Box sx={{ flexShrink: 0 }}>
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                                {row.label}{' '}
                                {showRequiredTag && row.mandatory && (
                                    <Typography component="span" variant="caption" sx={{ color: FIORI.warning, fontWeight: 700 }}>
                                        {t('pushReviewRequired')}
                                    </Typography>
                                )}
                            </Typography>
                            {row.type && (
                                <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>
                                    {row.type}
                                </Typography>
                            )}
                        </Box>
                        <Typography
                            variant="body2"
                            sx={{
                                color: blocking ? FIORI.error : empty ? FIORI.textSecondary : FIORI.textPrimary,
                                fontWeight: blocking ? 600 : 400,
                                textAlign: 'right',
                                wordBreak: 'break-word',
                                maxHeight: 96,
                                overflow: 'hidden',
                            }}
                        >
                            {empty ? t('pushReviewEmpty') : plainText(row.value)}
                        </Typography>
                    </Stack>
                );
            })}
        </Stack>
    );
}
