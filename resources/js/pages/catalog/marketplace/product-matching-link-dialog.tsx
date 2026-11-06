import { AsyncSearchComboBox } from '@/components/catalog/async-search-combo-box';
import { FioriMessageStrip } from '@/components/fiori-form';
import { router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import { Bar, Button, Dialog, Label, SegmentedButton, SegmentedButtonItem, StepInput, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import { Body, Caption, HStack, TONE_TEXT } from './marketplace-ui';
import pm from './product-matching.module.css';

export interface ProductOption {
    id: number;
    sku: string;
    name: string | null;
}

/** what the dialog needs to know about the listing being linked */
export interface LinkDialogListing {
    id: number;
    seller_sku: string | null;
    name: string | null;
    item_id: string;
    pack_quantity: number | null;
    product: ProductOption | null;
    components: { product_id: number; sku: string; name: string | null; quantity: number }[];
    suggestions: {
        type: string;
        pack_quantity: number | null;
        items: { product_id: number; sku: string; name: string | null; quantity: number }[];
        score?: number;
    }[];
}

type Mode = 'single' | 'bundle';

interface BundleLine {
    product: ProductOption;
    quantity: number;
}

const productLabel = (p: ProductOption) => (p.name && p.name !== p.sku ? `${p.sku} — ${p.name}` : p.sku);

/** debounced server search against catalog.products.search (same endpoint as ProductPicker) */
function useProductSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        const controller = new AbortController();
        const timer = setTimeout(() => {
            fetch(`/catalog/products/search?${new URLSearchParams({ q: query.trim() }).toString()}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            })
                .then((res) => (res.ok ? res.json() : []))
                .then((data: ProductOption[]) => setResults(data))
                .catch(() => undefined)
                .finally(() => setLoading(false));
        }, 300);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    return { results, loading, setQuery };
}

function ProductSearch({
    value,
    onChange,
    placeholder,
}: {
    value: ProductOption | null;
    onChange: (p: ProductOption | null) => void;
    placeholder?: string;
}) {
    const { results, loading, setQuery } = useProductSearch();

    return (
        <AsyncSearchComboBox<ProductOption>
            value={value}
            onChange={onChange}
            results={results}
            loading={loading}
            getKey={(p) => p.id}
            getLabel={productLabel}
            onQueryChange={setQuery}
            placeholder={placeholder ?? 'ค้นหาด้วย SKU หรือชื่อสินค้า (อย่างน้อย 2 ตัวอักษร)'}
        />
    );
}

/**
 * "ผูกเอง" / "เปลี่ยน" dialog of the Product Matching page — link one
 * listing to a single PIM product (optionally a pack of N), or to several
 * products as a bundle ("ชุดรวม"). Prefilled from the current link, else
 * from the top suggestion. Posts to ProductMatchingActionsController.
 */
export function ProductMatchingLinkDialog({
    listing,
    pageUrl,
    onClose,
}: {
    listing: LinkDialogListing | null;
    pageUrl: string;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<Mode>('single');
    const [product, setProduct] = useState<ProductOption | null>(null);
    const [packQuantity, setPackQuantity] = useState(1);
    const [lines, setLines] = useState<BundleLine[]>([]);
    const [adding, setAdding] = useState<ProductOption | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const addKey = useRef(0);

    // (re)initialise whenever a different listing is opened
    useEffect(() => {
        if (!listing) return;
        setError(null);
        setAdding(null);
        const suggestion = listing.suggestions[0];
        if (listing.components.length > 0) {
            setMode('bundle');
            setLines(listing.components.map((c) => ({ product: { id: c.product_id, sku: c.sku, name: c.name }, quantity: c.quantity })));
            setProduct(null);
            setPackQuantity(1);
        } else if (listing.product) {
            setMode('single');
            setProduct(listing.product);
            setPackQuantity(listing.pack_quantity ?? 1);
            setLines([]);
        } else if (suggestion && suggestion.items.length > 1) {
            setMode('bundle');
            setLines(suggestion.items.map((i) => ({ product: { id: i.product_id, sku: i.sku, name: i.name }, quantity: i.quantity })));
            setProduct(null);
            setPackQuantity(1);
        } else if (suggestion) {
            const item = suggestion.items[0];
            setMode('single');
            setProduct({ id: item.product_id, sku: item.sku, name: item.name });
            setPackQuantity(suggestion.pack_quantity ?? 1);
            setLines([]);
        } else {
            setMode('single');
            setProduct(null);
            setPackQuantity(1);
            setLines([]);
        }
    }, [listing]);

    const addLine = (p: ProductOption | null) => {
        setAdding(null);
        addKey.current += 1;
        if (!p) return;
        setLines((prev) => (prev.some((l) => l.product.id === p.id) ? prev : [...prev, { product: p, quantity: 1 }]));
    };

    const canSubmit = mode === 'single' ? product !== null && packQuantity >= 1 : lines.length >= 2 && lines.every((l) => l.quantity >= 1);

    const submit = () => {
        if (!listing || !canSubmit) return;
        setSubmitting(true);
        setError(null);
        const url = `${pageUrl}/listings/${listing.id}/${mode === 'single' ? 'link' : 'bundle'}`;
        const data =
            mode === 'single'
                ? { product_id: product!.id, pack_quantity: packQuantity > 1 ? packQuantity : null }
                : { components: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })) };
        router.post(url, data, {
            preserveScroll: true,
            onSuccess: () => onClose(),
            onError: (errors) => setError(Object.values(errors)[0] ?? 'บันทึกไม่สำเร็จ'),
            onFinish: () => setSubmitting(false),
        });
    };

    return (
        <Dialog
            open={listing !== null}
            onClose={onClose}
            style={{ width: 'min(600px, calc(100vw - 2rem))' }}
            header={
                <div style={{ width: '100%', padding: '0.5rem 0' }}>
                    <Title level="H5" size="H5" wrappingType="Normal">
                        ผูก listing กับสินค้าใน PIM
                    </Title>
                    {listing && (
                        <Body style={{ color: TONE_TEXT.neutral, marginTop: '0.125rem' }}>
                            {listing.seller_sku ?? '(ไม่มี SKU)'} · Item {listing.item_id}
                        </Body>
                    )}
                </div>
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button design="Transparent" onClick={onClose}>
                                ยกเลิก
                            </Button>
                            <Button design="Emphasized" disabled={!canSubmit || submitting} loading={submitting} loadingDelay={0} onClick={submit}>
                                บันทึก
                            </Button>
                        </>
                    }
                />
            }
        >
            {listing && (
                <div className={pm.dialogBody}>
                    {listing.name && <Caption block>{listing.name}</Caption>}

                    <SegmentedButton
                        accessibleName="รูปแบบการผูก"
                        onSelectionChange={(e) => {
                            const next = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as Mode | undefined;
                            if (next) setMode(next);
                        }}
                    >
                        <SegmentedButtonItem data-value="single" selected={mode === 'single'}>
                            สินค้าเดียว / แพ็ก
                        </SegmentedButtonItem>
                        <SegmentedButtonItem data-value="bundle" selected={mode === 'bundle'}>
                            ชุดรวม
                        </SegmentedButtonItem>
                    </SegmentedButton>

                    {mode === 'single' ? (
                        <>
                            <div className={pm.dialogField}>
                                <Label showColon={false} required>
                                    สินค้าใน PIM
                                </Label>
                                <ProductSearch value={product} onChange={setProduct} />
                            </div>
                            {listing.suggestions.some((sg) => sg.type === 'similar') && (
                                <div className={pm.dialogField}>
                                    <Label showColon={false}>คำแนะนำจากชื่อ/แบรนด์ (เลือกเพื่อใส่ด้านบน)</Label>
                                    <HStack gap="0.375rem" wrap>
                                        {listing.suggestions
                                            .filter((sg) => sg.type === 'similar')
                                            .map((sg) => {
                                                const item = sg.items[0];
                                                return (
                                                    <Button
                                                        key={item.product_id}
                                                        design={product?.id === item.product_id ? 'Emphasized' : 'Default'}
                                                        tooltip={item.name ?? item.sku}
                                                        onClick={() => setProduct({ id: item.product_id, sku: item.sku, name: item.name })}
                                                    >
                                                        {item.sku} · {sg.score}
                                                    </Button>
                                                );
                                            })}
                                    </HStack>
                                </div>
                            )}
                            <div className={pm.dialogField}>
                                <Label showColon={false}>จำนวนต่อแพ็ก</Label>
                                <HStack gap="0.75rem">
                                    <StepInput
                                        value={packQuantity}
                                        min={1}
                                        max={9999}
                                        accessibleName="จำนวนต่อแพ็ก"
                                        style={{ width: '9rem' }}
                                        onChange={(e) => setPackQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                                    />
                                    <Caption>1 = ขายทีละชิ้น · N = listing นี้ขาย N ชิ้นของสินค้านี้</Caption>
                                </HStack>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={pm.dialogField}>
                                <Label showColon={false}>เพิ่มสินค้าในชุด</Label>
                                <ProductSearch key={addKey.current} value={adding} onChange={addLine} placeholder="ค้นหาแล้วเลือกเพื่อเพิ่มเข้าชุด" />
                            </div>
                            <div className={pm.bundleList}>
                                {lines.map((line) => (
                                    <div key={line.product.id} className={pm.bundleLine}>
                                        <div className={pm.cellStack} style={{ flex: 1 }}>
                                            <Body style={{ fontWeight: 600 }}>{line.product.sku}</Body>
                                            {line.product.name && line.product.name !== line.product.sku && <Caption>{line.product.name}</Caption>}
                                        </div>
                                        <StepInput
                                            value={line.quantity}
                                            min={1}
                                            max={9999}
                                            accessibleName={`จำนวน ${line.product.sku}`}
                                            style={{ width: '8rem' }}
                                            onChange={(e) => {
                                                const q = Math.max(1, Math.round(Number(e.target.value) || 1));
                                                setLines((prev) => prev.map((l) => (l.product.id === line.product.id ? { ...l, quantity: q } : l)));
                                            }}
                                        />
                                        <Button
                                            design="Transparent"
                                            icon="decline"
                                            tooltip="นำออก"
                                            accessibleName={`นำ ${line.product.sku} ออก`}
                                            onClick={() => setLines((prev) => prev.filter((l) => l.product.id !== line.product.id))}
                                        />
                                    </div>
                                ))}
                                {lines.length < 2 && <Caption>ชุดรวมต้องมีสินค้าอย่างน้อย 2 รายการ</Caption>}
                            </div>
                        </>
                    )}

                    {error && <FioriMessageStrip severity="error">{error}</FioriMessageStrip>}
                </div>
            )}
        </Dialog>
    );
}
