import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/vertical-grip.js';
import { Bar, Button, Dialog, Icon, Input, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './manage-columns-dialog.module.css';

export interface ManageColumnOption {
    key: string;
    label: string;
}

interface ManageColumnsDialogProps {
    open: boolean;
    onClose: () => void;
    columns: ManageColumnOption[];
    selected: string[];
    onApply: (selected: string[]) => void;
}

export function ManageColumnsDialog({ open, onClose, columns, selected, onApply }: ManageColumnsDialogProps) {
    const { t } = useTranslation('catalog');
    const [search, setSearch] = useState('');
    const [localSelected, setLocalSelected] = useState<string[]>(selected);
    const [dragKey, setDragKey] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setLocalSelected(selected);
            setSearch('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const labelByKey = new Map(columns.map((c) => [c.key, c.label]));

    const availableColumns = columns.filter((c) => !localSelected.includes(c.key) && c.label.toLowerCase().includes(search.toLowerCase()));
    const selectedColumns = localSelected.map((key) => ({ key, label: labelByKey.get(key) ?? key }));

    const addColumn = (key: string) => setLocalSelected((prev) => [...prev, key]);
    const removeColumn = (key: string) => setLocalSelected((prev) => prev.filter((k) => k !== key));

    const reorder = (target: string) => {
        if (!dragKey || dragKey === target) return;
        setLocalSelected((prev) => {
            const next = prev.filter((k) => k !== dragKey);
            const targetIndex = next.indexOf(target);
            next.splice(targetIndex, 0, dragKey);
            return next;
        });
    };

    const handleApply = () => {
        onApply(localSelected);
        onClose();
    };

    const renderItem = (col: ManageColumnOption, onClick: () => void, extra?: { onDrop: () => void }) => (
        <div
            key={col.key}
            role="button"
            tabIndex={0}
            draggable
            className={styles.item}
            onDragStart={() => setDragKey(col.key)}
            onDragEnd={() => setDragKey(null)}
            onDragOver={extra ? (e) => e.preventDefault() : undefined}
            onDrop={
                extra
                    ? (e) => {
                          e.stopPropagation();
                          extra.onDrop();
                      }
                    : undefined
            }
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            <Icon name="vertical-grip" className={styles.grip} />
            <span>{col.label}</span>
        </div>
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            style={{ width: 'min(600px, calc(100vw - 2rem))' }}
            header={
                <Bar
                    startContent={
                        <Title level="H5" size="H5">
                            {t('manageColumns')}
                        </Title>
                    }
                    endContent={<Button design="Transparent" icon="decline" accessibleName="Close" onClick={onClose} />}
                />
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <Button design="Emphasized" onClick={handleApply}>
                            {t('apply')}
                        </Button>
                    }
                />
            }
        >
            <div className={styles.columns}>
                {/* Available */}
                <div className={`${styles.pane} ${styles.paneAvailable}`}>
                    <Title level="H6" size="H6" className={styles.paneTitle}>
                        {t('availableColumns')}
                    </Title>
                    <Input
                        value={search}
                        onInput={(e) => setSearch(e.target.value)}
                        placeholder={t('searchColumns')}
                        icon={<Icon name="search" />}
                        style={{ width: '100%', marginBottom: '0.5rem' }}
                    />
                    <div
                        className={styles.list}
                        style={{ maxHeight: 340 }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                            if (dragKey) removeColumn(dragKey);
                            setDragKey(null);
                        }}
                    >
                        {availableColumns.map((col) => renderItem(col, () => addColumn(col.key)))}
                        {availableColumns.length === 0 && <span className={styles.empty}>—</span>}
                    </div>
                </div>

                {/* Selected */}
                <div className={styles.pane}>
                    <Title level="H6" size="H6" className={styles.paneTitle}>
                        {t('selectedColumns')}
                    </Title>
                    <div className={styles.list} style={{ maxHeight: 380, marginTop: '2.75rem' }}>
                        {selectedColumns.map((col) =>
                            renderItem(col, () => removeColumn(col.key), {
                                onDrop: () => {
                                    reorder(col.key);
                                    setDragKey(null);
                                },
                            }),
                        )}
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
