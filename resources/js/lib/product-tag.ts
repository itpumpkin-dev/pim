import { useTranslation } from 'react-i18next';

/**
 * ป้ายบนการ์ดสินค้า (product.tag) — ถ้า backend ส่ง tagKey มา (เช่น
 * 'discontinued' จาก ProductPresenter) ให้แปลตามภาษาปัจจุบันผ่าน
 * common:productTag.{key} ไม่งั้นใช้ข้อความ tag ดิบตามเดิม
 */
export function useProductTagLabel() {
    const { t } = useTranslation();

    return (product: { tag?: string; tagKey?: string }): string | undefined =>
        product.tagKey ? t(`productTag.${product.tagKey}`, { defaultValue: product.tag ?? product.tagKey }) : product.tag;
}
