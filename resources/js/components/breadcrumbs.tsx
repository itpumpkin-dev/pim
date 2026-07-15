import { type BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { Link } from '@inertiajs/react';
import { Breadcrumbs as MuiBreadcrumbs, Link as MuiLink, Typography } from '@mui/material';

export function Breadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItemType[] }) {
    if (breadcrumbs.length === 0) {
        return null;
    }

    return (
        <MuiBreadcrumbs aria-label="breadcrumb">
            {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return isLast ? (
                    <Typography key={index} variant="body2" color="text.primary">
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
