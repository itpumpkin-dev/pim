import { FioriField, ui5ValueState, type FioriValueState } from '@/components/fiori-form';
import { BusyIndicator, Input, type InputDomRef } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SkuAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * เช็คแบบ debounce ว่า SKU ที่พิมพ์อยู่ใช้ได้ไหม (ProductController::checkSku())
 * — ใช้กับ dialog ทำสำเนา/บันทึกเป็นเทมเพลต ที่บังคับให้กรอก SKU ใหม่ก่อน
 * ผลนี้แค่ช่วยบอกระหว่างพิมพ์ ตัวตัดสินจริงคือ validation ใน duplicate()
 */
export function useSkuAvailability(sku: string, enabled = true): SkuAvailability {
    const [status, setStatus] = useState<SkuAvailability>('idle');
    const trimmed = sku.trim();

    useEffect(() => {
        if (!enabled || trimmed === '') {
            setStatus('idle');
            return;
        }

        setStatus('checking');
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            fetch(`/catalog/products/check-sku?sku=${encodeURIComponent(trimmed)}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            })
                .then((res) => (res.ok ? res.json() : null))
                .then((json: { available: boolean; reason: 'required' | 'invalid' | 'taken' | null } | null) => {
                    if (!json) {
                        setStatus('idle');
                        return;
                    }
                    setStatus(json.available ? 'available' : json.reason === 'taken' ? 'taken' : 'invalid');
                })
                .catch(() => {
                    /* aborted — a newer keystroke owns the status now */
                });
        }, 400);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [trimmed, enabled]);

    return status;
}

interface NewProductSkuFieldProps {
    value: string;
    onChange: (value: string) => void;
    status: SkuAvailability;
    /** validation error ที่ backend ตอบกลับมาตอนกดยืนยัน (ชนะผลเช็คล่วงหน้าเสมอ) */
    serverError?: string | null;
    autoFocus?: boolean;
}

export function NewProductSkuField({ value, onChange, status, serverError, autoFocus = true }: NewProductSkuFieldProps) {
    const { t } = useTranslation('catalog');
    const inputRef = useRef<InputDomRef>(null);

    // React's autoFocus only works on native form controls — focus the UI5
    // Input manually. Delayed so it lands after a UI5 Dialog's own initial focus.
    useEffect(() => {
        if (!autoFocus) return;
        const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    let state: FioriValueState = 'none';
    let message: string | undefined;
    if (serverError) {
        state = 'error';
        message = serverError;
    } else if (status === 'taken') {
        state = 'error';
        message = t('newSkuTaken');
    } else if (status === 'invalid') {
        state = 'error';
        message = t('newSkuInvalid');
    } else if (status === 'available') {
        state = 'success';
        message = t('newSkuAvailable');
    }

    return (
        <FioriField label={t('newSku')} htmlFor="new-product-sku" required valueState={state} message={message} labelWidth={90}>
            {/* message แสดงโดย FioriField ด้านล่างช่องแล้ว — ไม่ส่ง valueStateMessage ให้ Input ซ้ำ */}
            <Input
                id="new-product-sku"
                style={{ width: '100%' }}
                ref={inputRef}
                value={value}
                onInput={(e) => onChange(e.target.value)}
                // UI5 change = blur/Enter (เหมือน onBlur เดิม) → ตัดช่องว่างหัวท้าย
                onChange={(e) => onChange(e.target.value.trim())}
                placeholder={t('skuPlaceholder')}
                valueState={ui5ValueState(state)}
                icon={status === 'checking' ? <BusyIndicator active size="S" delay={0} /> : undefined}
            />
        </FioriField>
    );
}
