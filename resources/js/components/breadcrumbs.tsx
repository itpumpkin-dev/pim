import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { router } from '@inertiajs/react';
import { BreadcrumbsItem, Breadcrumbs as Ui5Breadcrumbs, type BreadcrumbsPropTypes } from '@ui5/webcomponents-react';
import { type CSSProperties } from 'react';

interface BreadcrumbsProps {
    breadcrumbs: BreadcrumbItemType[];
    style?: CSSProperties;
    className?: string;
}

/**
 * SAP Fiori "Breadcrumb" — a trail down to the current page, on the official
 * UI5 `Breadcrumbs` control. ref: sap.com/design-system/fiori-design-web →
 * UI elements → Breadcrumb
 *
 * The last item is the current page: UI5 renders it as plain (non-link) text
 * and never moves it into the overflow. When the trail doesn't fit, the
 * leading (origin-most) links collapse into UI5's own overflow dropdown —
 * the guideline's sap.m.Select behaviour — so there's no `compact` mode any
 * more; the control measures itself.
 *
 * Clicks are routed through Inertia (`router.visit`) so navigation stays
 * client-side; ctrl/⌘/shift/alt-clicks fall through to the real `href` so
 * "open in new tab" still works.
 *
 * `href="#"` is this app's placeholder for a segment with nowhere to go yet
 * (100+ call sites). Those items get no `href` and their clicks are
 * swallowed — UI5 has no "plain-text middle crumb" mode, so they still look
 * like links, but clicking one does nothing (never a full page reload to #).
 */
export function Breadcrumbs({ breadcrumbs, style, className }: BreadcrumbsProps) {
    if (breadcrumbs.length === 0) {
        return null;
    }

    const onItemClick: BreadcrumbsPropTypes['onItemClick'] = (e) => {
        const { item, altKey, ctrlKey, metaKey, shiftKey } = e.detail;
        const href = item.getAttribute('href');

        if (href && (altKey || ctrlKey || metaKey || shiftKey)) {
            return;
        }

        e.preventDefault();
        if (href) {
            router.visit(href);
        }
    };

    return (
        <Ui5Breadcrumbs onItemClick={onItemClick} style={style} className={className}>
            {breadcrumbs.map((item, index) => {
                const isCurrent = index === breadcrumbs.length - 1;
                const isPlaceholder = !item.href || item.href === '#';

                return (
                    <BreadcrumbsItem key={index} href={isCurrent || isPlaceholder ? undefined : item.href}>
                        {item.title}
                    </BreadcrumbsItem>
                );
            })}
        </Ui5Breadcrumbs>
    );
}
