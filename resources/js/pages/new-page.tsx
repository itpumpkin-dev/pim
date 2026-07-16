import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Box } from '@mui/material';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'New Page',
        href: '/new-page',
    },
];

const placeholderSx = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 3,
    border: 1,
    borderColor: 'divider',
    bgcolor: 'action.hover',
};

export default function NewPage() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New Page" />
            <Box sx={{ display: 'flex', height: '100%', flex: 1, flexDirection: 'column', gap: 2, p: 2 }}>
                <Box sx={[placeholderSx, { flex: 1, minHeight: { xs: '60vh', md: 'unset' } }]} />
            </Box>
        </AppLayout>
    );
}
