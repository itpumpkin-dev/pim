import { FioriField, fioriFieldStateSx, type FioriValueState } from '@/components/fiori-form';
import { CircularProgress, InputAdornment, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
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
            <TextField
                id="new-product-sku"
                fullWidth
                size="small"
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={(e) => onChange(e.target.value.trim())}
                placeholder={t('skuPlaceholder')}
                sx={fioriFieldStateSx(state)}
                slotProps={{
                    input: {
                        endAdornment:
                            status === 'checking' ? (
                                <InputAdornment position="end">
                                    <CircularProgress size={14} />
                                </InputAdornment>
                            ) : undefined,
                    },
                }}
            />
        </FioriField>
    );
}
