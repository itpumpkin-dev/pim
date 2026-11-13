/**
 * เงื่อนไขรูปสินค้าของแต่ละแพลตฟอร์ม (ตามหน้า seller center ของแต่ละเจ้า ณ 2026-11) — ใช้เตือนใน
 * GalleryEditor เท่านั้น ไม่ได้บล็อกการบันทึก เพราะแกลเลอรี (pgallery) ชุดเดียวใช้กับทุกแพลตฟอร์ม:
 * รูปที่ไม่ผ่านของเจ้าหนึ่งอาจใช้ได้กับอีกเจ้า. จำนวนสูงสุดตรงกับที่ฝั่ง push ตัดไว้
 * (LazadaProductSyncService 8, Shopee/TikTokProductSyncService 9).
 */
export type ImagePlatform = 'lazada' | 'shopee' | 'tiktok' | 'woocommerce';

export interface ImageMeta {
    width: number | null;
    height: number | null;
    bytes: number | null;
}

export interface PlatformImageRule {
    label: string;
    /** จำนวนรูปสูงสุดที่แพลตฟอร์มรับ (undefined = ไม่ได้กำหนด) */
    max?: number;
    minPx?: number;
    maxPx?: number;
    maxBytes?: number;
    /** สัดส่วนที่ยอมรับ (กว้าง:สูง) */
    ratios?: { label: string; w: number; h: number }[];
    /** สรุปเงื่อนไขสั้นๆ สำหรับแสดงในตาราง */
    summary: string;
    /** คำแนะนำ (ไม่ได้ตรวจอัตโนมัติ) */
    tip?: string;
}

const MB = 1024 * 1024;

export const PLATFORM_IMAGE_RULES: Record<ImagePlatform, PlatformImageRule> = {
    lazada: {
        label: 'Lazada',
        max: 8,
        minPx: 330,
        maxPx: 6500,
        maxBytes: 6 * MB,
        summary: 'สูงสุด 8 รูป · 330×330 ถึง 6500×6500 px · ไฟล์ไม่เกิน 6 MB',
        tip: 'ห้ามภาพลามกอนาจารโดยเด็ดขาด',
    },
    shopee: {
        label: 'Shopee',
        max: 9,
        ratios: [
            { label: '1:1', w: 1, h: 1 },
            { label: '3:4', w: 3, h: 4 },
        ],
        summary: 'สูงสุด 9 รูป · สัดส่วน 1:1 หรือ 3:4',
    },
    tiktok: {
        label: 'TikTok',
        max: 9,
        minPx: 300,
        summary: 'สูงสุด 9 รูป · ขั้นต่ำ 300×300 px',
        tip: 'แนะนำให้รูปแรกเป็นพื้นหลังสีขาว ไม่มีข้อความ โลโก้ กรอบ ลายน้ำ หรือกราฟิกอื่น — ถ้ามีข้อความในรูปให้ใช้ภาษาไทย',
    },
    woocommerce: {
        label: 'WooCommerce',
        summary: 'ไม่มีข้อกำหนดจำนวนหรือขนาดจากแพลตฟอร์ม',
    },
};

/** ลำดับแสดงผล — แพลตฟอร์มของหน้าที่เปิดอยู่ขึ้นก่อน */
export const imagePlatformOrder = (current: ImagePlatform): ImagePlatform[] => [
    current,
    ...(['lazada', 'shopee', 'tiktok', 'woocommerce'] as ImagePlatform[]).filter((p) => p !== current),
];

const RATIO_TOLERANCE = 0.02;

const formatMb = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

/** ปัญหาของรูปหนึ่งรูปตามเงื่อนไขของแพลตฟอร์ม (ว่าง = ผ่าน; ไม่รู้ขนาด = ข้ามการตรวจข้อนั้น) */
export function imageIssues(rule: PlatformImageRule, meta: ImageMeta): string[] {
    const issues: string[] = [];
    const { width, height, bytes } = meta;

    if (width !== null && height !== null) {
        if (rule.minPx && (width < rule.minPx || height < rule.minPx)) {
            issues.push(`เล็กกว่า ${rule.minPx}×${rule.minPx} px (รูปนี้ ${width}×${height})`);
        }
        if (rule.maxPx && (width > rule.maxPx || height > rule.maxPx)) {
            issues.push(`ใหญ่กว่า ${rule.maxPx}×${rule.maxPx} px (รูปนี้ ${width}×${height})`);
        }
        if (rule.ratios && !rule.ratios.some((r) => Math.abs(width / height - r.w / r.h) <= RATIO_TOLERANCE)) {
            issues.push(`สัดส่วนไม่ใช่ ${rule.ratios.map((r) => r.label).join(' หรือ ')} (รูปนี้ ${width}×${height})`);
        }
    }
    if (bytes !== null && rule.maxBytes && bytes > rule.maxBytes) {
        issues.push(`ไฟล์ใหญ่กว่า ${formatMb(rule.maxBytes)} (รูปนี้ ${formatMb(bytes)})`);
    }

    return issues;
}
