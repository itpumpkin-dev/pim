import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { Link } from '@inertiajs/react';
import { Breadcrumbs as MuiBreadcrumbs, Link as MuiLink, Typography } from '@mui/material';

interface BreadcrumbsProps {
    breadcrumbs: BreadcrumbItemType[];
    /**
     * Narrower layouts (the shell bar on mobile) collapse more aggressively —
     * only the last 2 crumbs stay visible before the "…" expander, instead
     * of the full trail. Default (false) is generous enough that this
     * app's breadcrumbs (rarely more than 4-5 levels) essentially never
     * collapse on desktop.
     */
    compact?: boolean;
}

/**
 * SAP Fiori "Breadcrumb" — a trail down to the current page.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Breadcrumb
 *
 * Per the guideline: the current page is the trail's last item, shown as
 * plain text (never a link) and never truncated out of the trail — when
 * the full trail doesn't fit, the *leading* (origin-most) links collapse
 * behind an expandable "…" first, and the last item stays visible always.
 * MUI's built-in maxItems/itemsBeforeCollapse/itemsAfterCollapse drives
 * that: clicking "…" expands the hidden links in place rather than opening
 * the dropdown menu the guideline describes (sap.m.Select) — same practical
 * result (nothing's ever silently lost) without a bespoke popup component.
 *
 * Also treats an `href="#"` crumb as plain text, not a link — this app
 * uses "#" as a placeholder for a breadcrumb segment with nowhere to
 * navigate to yet (e.g. a parent section with no index page of its own),
 * and it's common (100+ call sites). Rendering it as a real MUI Link gave
 * it hover/underline affordances promising a click would do something,
 * when it silently wouldn't — not a real link, so it shouldn't look like one.
 */
export function Breadcrumbs({ breadcrumbs, compact = false }: BreadcrumbsProps) {
    if (breadcrumbs.length === 0) {
        return null;
    }

    return (
        <MuiBreadcrumbs
            aria-label="breadcrumb"
            separator="/"
            maxItems={compact ? 2 : 8}
            itemsBeforeCollapse={0}
            itemsAfterCollapse={compact ? 2 : 8}
        >
            {breadcrumbs.map((item, index) => {
                const isCurrent = index === breadcrumbs.length - 1;
                const isPlaceholder = item.href === '#';

                return isCurrent || isPlaceholder ? (
                    <Typography key={index} variant="body2" color={isCurrent ? 'text.primary' : 'text.secondary'} fontWeight={isCurrent ? 500 : 400}>
                        {item.title}
                    </Typography>
                ) : (
                    <MuiLink key={index} component={Link} href={item.href} underline="hover" color="text.secondary" variant="body2">
                        {item.title}
                    </MuiLink>
                );
            })}
        </MuiBreadcrumbs>
    );
}
