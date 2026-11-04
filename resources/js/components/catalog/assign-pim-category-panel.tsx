import '@ui5/webcomponents-icons/dist/accept.js';
import { Button, MessageStrip, Text } from '@ui5/webcomponents-react';
import { useState } from 'react';

import { CategoryPicker, type CategoryOption } from '@/components/catalog/category-picker';
import { xsrfToken } from '@/lib/csrf';

export interface AssignPimCategoryPanelProps {
    productId: number;
    onAssigned: (category: CategoryOption) => void;
}

/**
 * ให้กำหนด PIM category ของสินค้าได้ตรงจากหน้า mapping ของแต่ละ marketplace
 * (Section 1, "Category Mapping") ตอน `activeProduct.master_category` เป็น
 * null — ก่อนหน้านี้ไม่มีทางออกให้เลยตรงนี้: ปุ่ม "บันทึก Category Mapping"
 * ของแต่ละหน้าเช็ค `master_category` ก่อนเสมอ (ดู saveCategoryMapping() ของ
 * {shopee,lazada,tiktok,woocommerce}-products.tsx) ถ้าเป็น null จะ return
 * ทันทีแบบเงียบๆ ไม่มี error ให้เห็นเลย — ผู้ใช้ต้องเดาเองว่าต้องไปหน้า Edit
 * Product ก่อน ทั้งที่หน้านั้นไม่ได้ลิงก์ถึงกันเลย
 *
 * ตั้งใจให้แคบ: ใช้ ProductController::assignCategory() (ดู docblock ฝั่งนั้น
 * ประกอบ) ซึ่งรับเฉพาะสินค้าที่ยังไม่มีหมวดหมู่เลยเท่านั้น — สินค้าที่มีอยู่แล้ว
 * ต้องไปเปลี่ยนที่หน้า Edit Product แทน ไม่ใช่จากตรงนี้
 */
export function AssignPimCategoryPanel({ productId, onAssigned }: AssignPimCategoryPanelProps) {
    const [selected, setSelected] = useState<CategoryOption | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = () => {
        if (!selected) return;

        setSaving(true);
        setError(null);

        // fetch() ตรงๆ ไม่ใช่ router.post ของ Inertia — ฝั่ง backend
        // (ProductController::assignCategory()) ตอบเป็น JSON จริงทั้งสอง
        // เคส (สำเร็จ/พังเพราะมีหมวดหมู่อยู่แล้ว) ไม่ใช่ redirect+flash ที่
        // อ่านตรงนี้ไม่ได้
        fetch(`/catalog/products/${productId}/assign-category`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ category_id: selected.id }),
        })
            .then(async (res) => {
                if (res.ok) {
                    onAssigned(selected);
                    return;
                }
                const body = await res.json().catch(() => null);
                setError(body?.message ?? 'กำหนดหมวดหมู่ไม่สำเร็จ');
            })
            .catch(() => setError('กำหนดหมวดหมู่ไม่สำเร็จ'))
            .finally(() => setSaving(false));
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: 'var(--sapElement_BorderCornerRadius)',
                background: 'var(--sapWarningBackground, var(--fiori-warning-bg))',
                border: '1px dashed var(--sapCriticalColor)',
            }}
        >
            <Text style={{ fontWeight: 600, color: 'var(--sapTextColor)' }}>
                สินค้านี้ยังไม่มีหมวดหมู่ PIM — กำหนดก่อน ถึงจะบันทึก Category Mapping ด้านบนได้
            </Text>

            <div style={{ maxWidth: 420 }}>
                <CategoryPicker value={selected} onChange={setSelected} placeholder="ค้นหาหมวดหมู่ PIM..." />
            </div>

            {error && (
                <MessageStrip design="Negative" onClose={() => setError(null)}>
                    {error}
                </MessageStrip>
            )}

            <div>
                <Button
                    design="Emphasized"
                    icon={saving ? undefined : 'accept'}
                    loading={saving}
                    loadingDelay={0}
                    disabled={!selected || saving}
                    onClick={save}
                >
                    กำหนดหมวดหมู่ PIM
                </Button>
            </div>
        </div>
    );
}
