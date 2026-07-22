import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Box } from '@mui/material';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: '/dashboard',
    },
];

const placeholderSx = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 3,
    border: 1,
    borderColor: 'divider',
    bgcolor: 'background.paper',
    boxShadow: 1,
};

export default function Dashboard() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <Box sx={{ display: 'flex', height: '100%', flex: 1, flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.default' }}>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gridAutoRows: 'min-content' }}>
                    <Box sx={[placeholderSx, { aspectRatio: '16 / 9' }]} />
                    <Box sx={[placeholderSx, { aspectRatio: '16 / 9' }]} />
                    <Box sx={[placeholderSx, { aspectRatio: '16 / 9' }]} />
                </Box>
                <Box sx={[placeholderSx, { flex: 1, minHeight: { xs: '60vh', md: 'unset' } }]} />
            </Box>
        </AppLayout>
    );
}
