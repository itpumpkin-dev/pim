import { APPEARANCE_OPTIONS } from '@/components/appearance-dropdown';
import { type Appearance, useAppearance } from '@/hooks/use-appearance';
import { SegmentedButton, SegmentedButtonItem } from '@ui5/webcomponents-react';
import { type CSSProperties } from 'react';

export default function AppearanceToggleTab({ style, className }: { style?: CSSProperties; className?: string }) {
    const { appearance, updateAppearance } = useAppearance();

    return (
        <SegmentedButton
            style={style}
            className={className}
            onSelectionChange={(e) => {
                const mode = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.mode as Appearance | undefined;
                if (mode) updateAppearance(mode);
            }}
        >
            {APPEARANCE_OPTIONS.map((o) => (
                <SegmentedButtonItem key={o.mode} data-mode={o.mode} icon={o.icon} selected={appearance === o.mode}>
                    {o.label}
                </SegmentedButtonItem>
            ))}
        </SegmentedButton>
    );
}
